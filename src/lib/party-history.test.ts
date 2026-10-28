import { describe, it, expect } from "vitest";
import { assembleHistory, resolveAccounts, type Raw } from "./party-history";

describe("resolveAccounts", () => {
  const parties = [{ id: "p1", name: "ABC Traders" }, { id: "p2", name: "Other" }];
  const transporters = [{ id: "t1", name: "abc  traders", party_id: null }, { id: "t2", name: "Linked", party_id: "p2" }, { id: "t3", name: "Solo", party_id: null }];
  it("party includes its transporter account (same name or explicit link)", () => {
    expect(resolveAccounts({ kind: "party", id: "p1" }, parties, transporters).transporters.map((t) => t.id)).toEqual(["t1"]);
    expect(resolveAccounts({ kind: "party", id: "p2" }, parties, transporters).transporters.map((t) => t.id)).toEqual(["t2"]);
  });
  it("transporter includes its party; a solo transporter has none", () => {
    expect(resolveAccounts({ kind: "transporter", id: "t2" }, parties, transporters).parties.map((p) => p.id)).toEqual(["p2"]);
    expect(resolveAccounts({ kind: "transporter", id: "t3" }, parties, transporters).parties).toEqual([]);
  });
});

describe("assembleHistory", () => {
  const lr = { id: "L1", lr_number: "LR-1", lr_date: "2026-04-05", trip_id: "T1", loading_point: "Delhi", delivery_point: "Pune", final_freight: 3000, freight_payable: 2500, transporter_id: "t1", billing_party_id: "p1", delivery_status: "pending", status: "active" };
  const raw: Raw = {
    parties: [{ id: "p1", name: "ABC" }], transporters: [{ id: "t1", name: "ABC" }],
    ledger: [
      { account: "party", accountId: "p1", name: "ABC", rows: [
        { id: "a", entry_date: "2026-03-01", debit: 1000, credit: 0, line_kind: "opening_balance", description: "Opening balance" },
        { id: "b", entry_date: "2026-04-05", debit: 3000, credit: 0, line_kind: "freight", source_table: "lrs", source_id: "L1", description: "LR-1" },
        { id: "c", entry_date: "2026-04-20", debit: 0, credit: 1200, line_kind: "payment", source_table: "payments", source_id: "P1", description: "Receipt" } ] },
      { account: "transporter", accountId: "t1", name: "ABC", rows: [{ id: "d", entry_date: "2026-04-05", debit: 0, credit: 2500, line_kind: "freight_payable", source_table: "lrs", source_id: "L1", description: "LR-1 payable" }] },
    ],
    lrs: new Map([["L1", lr]]), lrParties: new Map([["L1", [{ role: "consignor", seq: 1, party_id: "p1", freight_amount: 3000, parties: { name: "ABC" } }, { role: "consignee", seq: 2, party_id: "x", freight_amount: 0, parties: { name: "Buyer" } }]]]),
    trips: new Map([["T1", { id: "T1", trip_number: "TRP-1", market_vehicle_number: "HR35F3747", vehicles: null, driver_name: "Ram" }]]),
    payments: new Map([["P1", { id: "P1", lr_id: "L1", trip_id: "T1", reference: "UTR9" }]]), allocations: new Map(), lrExpenses: new Map(), tripExpenses: new Map([["T1", 400]]), tripDriverAdvances: new Map([["T1", 500]]),
    commissions: [{ id: "c1", amount: 100, received_amount: 40, pending_amount: 60, commission_date: "2026-04-06", is_cancelled: false }], driverNames: new Map(),
  };
  it("statements reconcile and rows carry LR, trip, vehicle, driver, route", () => {
    const h = assembleHistory(raw, "2026-04-01", "2026-04-30");
    const party = h.statements[0].st;
    expect(party.opening).toBe(1000); expect(party.totalDebit).toBe(3000); expect(party.totalCredit).toBe(1200); expect(party.closing).toBe(2800);
    expect(h.statements[1].st.closing).toBe(-2500);
    const t = h.tx.find((r) => r.reference === "UTR9")!;
    expect(t.lrNo).toBe("LR-1"); expect(t.vehicle).toBe("HR35F3747"); expect(t.driver).toBe("Ram"); expect(t.route).toBe("Delhi → Pune");
    expect(h.tx.length).toBe(3);
  });
  it("LR rows show roles, party share and informational trip amounts; commission summed", () => {
    const h = assembleHistory(raw);
    expect(h.lrRows[0].roles).toBe("Consignor / Billing party / Transporter"); expect(h.lrRows[0].shareFreight).toBe(3000);
    expect(h.lrRows[0].tripExpenses).toBe(400); expect(h.lrRows[0].consignees).toBe("Buyer");
    expect(h.commission).toEqual({ earned: 100, received: 40, pending: 60 });
  });
  it("period filter drops LRs outside the period", () => {
    expect(assembleHistory(raw, "2026-05-01", "2026-05-31").lrRows.length).toBe(0);
  });
});
