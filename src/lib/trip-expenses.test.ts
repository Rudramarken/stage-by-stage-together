import { describe, expect, it } from "vitest";
import { advancesPayload, advancesToForm, advanceTotal, blankAdvance, blankExpense, expensesPayload, expensesToForm, expenseTotal, parseAmount, validateAdvances, validateExpenses } from "./trip-expenses";

const D = "2026-10-28";
const saved = (o: Record<string, unknown>) => ({ trip_id: "T", scope: "trip", is_cancelled: false, ...o });

describe("trip expenses form state", () => {
  it("always offers the four fixed categories, even for a trip with no expenses", () => {
    const f = expensesToForm([], D);
    expect(Object.values(f.fixed).map((r) => r.category)).toEqual(["TOLL TAX", "CNG", "FOOD", "POLICE"]);
    expect(expenseTotal(f)).toBe(0);
    expect(expensesPayload(f, D)).toEqual([]); // nothing typed => nothing sent (no fake zero records)
  });

  it("reloads saved records into the same rows with their original ids (so a re-save updates, never duplicates)", () => {
    const f = expensesToForm([saved({ id: "E1", category: "TOLL TAX", amount: 500 }), saved({ id: "E2", category: "Parking", amount: "80.5", paid_to: "Gate" })], D);
    expect(f.fixed.toll.id).toBe("E1");
    expect(f.fixed.toll.saved).toBe(true);
    expect(f.extra.map((r) => r.id)).toEqual(["E2"]);
    expect(expenseTotal(f)).toBe(580.5);
    const payload = expensesPayload(f, D);
    expect(payload.map((p) => p.id)).toEqual(["E1", "E2"]);
    expect(payload.some((p) => !("id" in p))).toBe(false);
  });

  it("maps legacy 'Toll' / 'Driver Food' records onto the fixed rows without renaming them", () => {
    const f = expensesToForm([saved({ id: "L1", category: "Toll", amount: 100 }), saved({ id: "L2", category: "Driver Food", amount: 200 })], D);
    expect(f.fixed.toll.id).toBe("L1"); expect(f.fixed.food.id).toBe("L2");
    expect(expensesPayload(f, D).find((p) => p.id === "L1")?.category).toBe("Toll");
  });

  it("never hides a second record of the same fixed category and skips cancelled ones", () => {
    const f = expensesToForm([saved({ id: "A", category: "CNG", amount: 10 }), saved({ id: "B", category: "cng", amount: 20 }), saved({ id: "C", category: "FOOD", amount: 5, is_cancelled: true })], D);
    expect(f.fixed.cng.id).toBe("A"); expect(f.extra.map((r) => r.id)).toEqual(["B"]); expect(f.fixed.food.saved).toBe(false);
    expect(expenseTotal(f)).toBe(30);
  });

  it("new typed amounts get client ids, a date and cash method; ids are stable between two builds of the payload", () => {
    const f = expensesToForm([], D);
    f.fixed.cng.amount = "1200"; f.fixed.police.amount = "300";
    const a = expensesPayload(f, D); const b = expensesPayload(f, D);
    expect(a).toEqual(b);
    expect(a).toHaveLength(2);
    expect(a[0]).toMatchObject({ category: "CNG", amount: 1200, expense_date: D, payment_method: "cash" });
    expect(expenseTotal(f)).toBe(1500);
  });

  it("rejects zero, negative, non-numeric and 3-decimal amounts", () => {
    for (const bad of ["0", "-5", "abc", "10.123", "1e999"]) { const f = expensesToForm([], D); f.fixed.toll.amount = bad; expect(validateExpenses(f)).toMatch(/TOLL TAX/); }
    expect(parseAmount("250.75")).toBe(250.75);
  });

  it("does not let a saved expense be silently blanked; cancelling needs the explicit cancel flag", () => {
    const f = expensesToForm([saved({ id: "E1", category: "FOOD", amount: 90 })], D);
    f.fixed.food.amount = "";
    expect(validateExpenses(f)).toMatch(/Cancel/);
    f.fixed.food.cancelReason = "Entered twice";
    expect(validateExpenses(f)).toBeNull();
    expect(expensesPayload(f, D)).toEqual([{ id: "E1", cancel: true, cancel_reason: "Entered twice" }]);
    expect(expenseTotal(f)).toBe(0);
  });

  it("additional expenses need a category and amount, but untouched new rows are ignored", () => {
    const f = expensesToForm([], D);
    f.extra.push(blankExpense("", D));
    expect(validateExpenses(f)).toBeNull();
    expect(expensesPayload(f, D)).toEqual([]);
    f.extra[0].notes = "tyre"; expect(validateExpenses(f)).toMatch(/category/);
    f.extra[0].category = "Repairs"; expect(validateExpenses(f)).toMatch(/enter an amount/);
    f.extra[0].amount = "450"; expect(validateExpenses(f)).toBeNull();
    expect(expensesPayload(f, D)[0]).toMatchObject({ category: "Repairs", amount: 450, paid_to: "", notes: "tyre" });
  });
});

describe("driver advances in the trip form", () => {
  it("loads only the trip's non-cancelled DRIVER advances with their ids", () => {
    const rows = advancesToForm([
      { id: "A1", recipient_type: "driver", driver_id: "D1", amount: 2000, advance_date: D, is_cancelled: false },
      { id: "A2", recipient_type: "transporter", amount: 500, is_cancelled: false },
      { id: "A3", recipient_type: "driver", driver_id: "D1", amount: 9, is_cancelled: true },
    ]);
    expect(rows.map((r) => r.id)).toEqual(["A1"]);
    expect(advanceTotal(rows)).toBe(2000);
  });

  it("re-saving an unchanged advance sends the same id (update), so no second ledger line can be created", () => {
    const rows = advancesToForm([{ id: "A1", recipient_type: "driver", driver_id: "D1", amount: 2000, advance_date: D, payment_method: "cash" }]);
    const p1 = advancesPayload(rows, "D1"); const p2 = advancesPayload(rows, "D1");
    expect(p1).toEqual(p2);
    expect(p1[0]).toMatchObject({ id: "A1", driver_id: "D1", amount: 2000 });
  });

  it("changing the amount keeps the id; the original driver is kept even if the trip driver changed", () => {
    const rows = advancesToForm([{ id: "A1", recipient_type: "driver", driver_id: "D1", amount: 2000, advance_date: D }]);
    rows[0].amount = "2500";
    expect(advancesPayload(rows, "D9")[0]).toMatchObject({ id: "A1", driver_id: "D1", amount: 2500 });
  });

  it("a new advance needs a registered driver and a valid amount", () => {
    const r = blankAdvance(D); r.amount = "1000";
    expect(validateAdvances([r], null)).toMatch(/registered driver/);
    expect(validateAdvances([r], "D1")).toBeNull();
    r.amount = "-1"; expect(validateAdvances([r], "D1")).toMatch(/greater than 0/);
    expect(advancesPayload([Object.assign(blankAdvance(D), { amount: "700" })], "D1")[0]).toMatchObject({ driver_id: "D1", amount: 700 });
  });

  it("removing a saved advance is an explicit cancel with a reason; blanking it is refused", () => {
    const rows = advancesToForm([{ id: "A1", recipient_type: "driver", driver_id: "D1", amount: 2000, advance_date: D }]);
    rows[0].amount = ""; expect(validateAdvances(rows, "D1")).toMatch(/Cancel/);
    rows[0].cancelReason = "Wrong driver";
    expect(validateAdvances(rows, "D1")).toBeNull();
    expect(advancesPayload(rows, "D1")).toEqual([{ id: "A1", cancel: true, cancel_reason: "Wrong driver" }]);
    expect(advanceTotal(rows)).toBe(0);
  });

  it("an untouched new advance row is ignored", () => {
    expect(validateAdvances([blankAdvance(D)], null)).toBeNull();
    expect(advancesPayload([blankAdvance(D)], null)).toEqual([]);
  });
});
