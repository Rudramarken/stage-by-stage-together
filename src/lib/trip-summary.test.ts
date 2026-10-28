import { describe, expect, it } from "vitest";
import { summarizeTrip, type SummaryLeg } from "./trip-summary";

const lr = (o: Record<string, unknown> = {}) => ({ id: "L", status: "active", final_freight: 50000, freight_payable: 42000, commission_enabled: false, commission_amount: 0, direct_payment_enabled: false, direct_payment_amount: 0, ...o });
const exp = (o: Record<string, unknown>) => ({ scope: "trip", responsible: "gokul", is_cancelled: false, amount: 0, ...o });
const leg = (o: Partial<SummaryLeg> = {}): SummaryLeg => ({ trip: { status: "completed", vehicle_mode: "market", transporter_id: "T" }, lrs: [lr()], expenses: [exp({ amount: 1000 })], advances: [], commissions: [], ...o });

describe("trip financial summary", () => {
  it("profit = freight - transporter payable + commission - Gokul expenses", () => {
    const s = summarizeTrip([leg({ lrs: [lr({ commission_enabled: true, commission_amount: 1500 })], expenses: [exp({ amount: 600 }), exp({ amount: 400, scope: "consignor" })] })]);
    expect(s.customerFreight).toBe(50000); expect(s.transporterPayable).toBe(42000); expect(s.commissionEarned).toBe(1500);
    expect(s.operatingExpenses).toBe(1000);
    expect(s.profit).toBe(50000 - 42000 + 1500 - 1000);
    expect(s.state).toBe("calculated"); expect(s.missing).toEqual([]);
  });

  it("does not deduct driver advances and does not treat payments as income or expense", () => {
    const s = summarizeTrip([leg({ advances: [{ recipient_type: "driver", amount: 5000 }, { recipient_type: "transporter", amount: 7000 }],
      payments: [{ payment_type: "customer_receipt", amount: 50000 }, { payment_type: "transporter_payment", amount: 20000 }] })]);
    expect(s.profit).toBe(50000 - 42000 - 1000);
    expect(s.driverAdvances).toBe(5000); expect(s.transporterAdvances).toBe(7000);
    expect(s.customerPayments).toBe(50000); expect(s.transporterPayments).toBe(20000);
  });

  it("does not add LR commission again when the consignee paid the driver directly", () => {
    const s = summarizeTrip([leg({ lrs: [lr({ commission_enabled: true, commission_amount: 1500, direct_payment_enabled: true, direct_payment_amount: 50000 })] })]);
    expect(s.commissionEarned).toBe(0); expect(s.profit).toBe(50000 - 42000 - 1000);
  });

  it("counts trip-level commission once and keeps received/pending separate from earned", () => {
    const s = summarizeTrip([leg({ trip: { status: "completed", vehicle_mode: "market", transporter_id: "T", commission_enabled: true, commission_amount: 800 }, commissions: [{ amount: 800, received_amount: 300, pending_amount: 500 }] })]);
    expect(s.commissionEarned).toBe(800); expect(s.commissionReceived).toBe(300); expect(s.commissionPending).toBe(500);
    expect(s.profit).toBe(50000 - 42000 + 800 - 1000);
  });

  it("charged-to-party expenses are not Gokul's cost", () => {
    const s = summarizeTrip([leg({ expenses: [exp({ amount: 1000 }), exp({ amount: 900, scope: "consignee", responsible: "party" })] })]);
    expect(s.operatingExpenses).toBe(1000); expect(s.expensesChargedToParty).toBe(900);
  });

  it("no freight => Incomplete with no profit figure (never a fake 0)", () => {
    const s = summarizeTrip([leg({ lrs: [] })]);
    expect(s.profit).toBeNull(); expect(s.customerFreight).toBeNull(); expect(s.state).toBe("incomplete"); expect(s.missing[0]).toMatch(/Customer freight/);
  });

  it("no expense records => Provisional and says expenses are not assumed zero", () => {
    const s = summarizeTrip([leg({ expenses: [] })]);
    expect(s.state).toBe("provisional"); expect(s.expenseRecords).toBe(0); expect(s.missing.join(" ")).toMatch(/Trip expenses/);
  });

  it("market truck with no transporter payable => Provisional", () => {
    const s = summarizeTrip([leg({ lrs: [lr({ freight_payable: 0 })] })]);
    expect(s.state).toBe("provisional"); expect(s.missing.join(" ")).toMatch(/Transporter freight payable/);
  });

  it("own truck with no payable and recorded expenses is Calculated; an unfinished trip stays Provisional", () => {
    const own = { status: "completed", vehicle_mode: "own", transporter_id: null };
    expect(summarizeTrip([leg({ trip: own, lrs: [lr({ freight_payable: 0 })] })]).state).toBe("calculated");
    expect(summarizeTrip([leg({ trip: { ...own, status: "in_transit" }, lrs: [lr({ freight_payable: 0 })] })]).state).toBe("provisional");
  });

  it("cancelled LRs, cancelled expenses and cancelled legs are excluded; each leg counted once", () => {
    const s = summarizeTrip([
      leg({ lrs: [lr(), lr({ status: "cancelled", final_freight: 99999 })], expenses: [exp({ amount: 1000 }), exp({ amount: 777, is_cancelled: true })] }),
      leg({ trip: { status: "cancelled" }, lrs: [lr({ final_freight: 12345 })] }),
      leg({ lrs: [lr({ final_freight: 20000, freight_payable: 15000 })], expenses: [exp({ amount: 500 })] }),
    ]);
    expect(s.customerFreight).toBe(70000); expect(s.transporterPayable).toBe(57000); expect(s.operatingExpenses).toBe(1500);
    expect(s.profit).toBe(70000 - 57000 - 1500);
  });
});
