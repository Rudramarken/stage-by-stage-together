import { describe, expect, it } from "vitest";
import { calcLrProfit, lrVehicleNumber, lrVehicleLabel, lrGokulExpenses, lrProfitFromRow } from "./lr-summary";

const base = { status: "active", finalFreight: 21000, freightPayable: 19550, hasTransporter: true, tripLinked: false, gokulExpenses: 500, commissionEnabled: false, commissionAmount: 0, directPaymentEnabled: false };

describe("lrVehicleNumber", () => {
  it("prefers the trip's registered vehicle, then market vehicle, then the LR's own vehicle", () => {
    expect(lrVehicleNumber({ vehicle_number: "X", trips: { vehicles: { registration_number: "HR55" }, market_vehicle_number: "M" } })).toBe("HR55");
    expect(lrVehicleNumber({ vehicle_number: "X", trips: { vehicles: null, market_vehicle_number: "M1" } })).toBe("M1");
    expect(lrVehicleNumber({ vehicle_number: " HR 38 A 1 ", trips: null })).toBe("HR 38 A 1");
  });
  it("returns null when nothing is known", () => {
    expect(lrVehicleNumber({})).toBeNull();
    expect(lrVehicleNumber(null)).toBeNull();
  });
});

describe("calcLrProfit", () => {
  it("freight - payable - Gokul expenses", () => {
    const r = calcLrProfit(base);
    expect(r.profit).toBe(950);
    expect(r.state).toBe("calculated");
  });
  it("is provisional when the LR is on a trip (shared trip expenses are not allocated)", () => {
    expect(calcLrProfit({ ...base, tripLinked: true }).state).toBe("provisional");
  });
  it("adds commission once, and never when the consignee paid the driver directly", () => {
    expect(calcLrProfit({ ...base, commissionEnabled: true, commissionAmount: 300 }).profit).toBe(1250);
    const d = calcLrProfit({ ...base, commissionEnabled: true, commissionAmount: 1450, directPaymentEnabled: true });
    expect(d.profit).toBe(950);
    expect(d.commissionAdded).toBe(0);
  });
  it("reports not enough data for cancelled or zero-freight LRs", () => {
    expect(calcLrProfit({ ...base, status: "cancelled" }).profit).toBeNull();
    expect(calcLrProfit({ ...base, finalFreight: 0 }).state).toBe("insufficient");
  });
});

describe("lrVehicleLabel", () => {
  it("shows Not Assigned when no vehicle is known, never a trip id", () => {
    expect(lrVehicleLabel({})).toBe("Not Assigned");
    expect(lrVehicleLabel({ vehicle_number: "  ", trips: { vehicles: null, market_vehicle_number: null } })).toBe("Not Assigned");
    expect(lrVehicleLabel({ vehicle_number: "HR55 A 1" })).toBe("HR55 A 1");
  });
});

describe("lrGokulExpenses / lrProfitFromRow", () => {
  const exps = [
    { amount: "300", responsible: "gokul", scope: "consignor", is_cancelled: false },
    { amount: 200, responsible: "party", scope: "consignee", is_cancelled: false },
    { amount: 999, responsible: "gokul", scope: "consignee", is_cancelled: true },
    { amount: 777, responsible: "gokul", scope: "trip", is_cancelled: false },
  ];
  it("counts only Gokul's own, non-cancelled LR-level expenses", () => {
    expect(lrGokulExpenses(exps)).toBe(300);
    expect(lrGokulExpenses(null)).toBe(0);
  });
  it("list profit equals the detail calculation", () => {
    const row = { status: "active", final_freight: "21000", freight_payable: "19550", transporter_id: "t", trip_id: null, expenses: exps };
    expect(lrProfitFromRow(row).profit).toBe(1150);
    expect(lrProfitFromRow(row).profit).toBe(calcLrProfit({ ...base, gokulExpenses: 300 }).profit);
  });
});
