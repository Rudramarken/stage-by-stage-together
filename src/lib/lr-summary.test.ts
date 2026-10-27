import { describe, expect, it } from "vitest";
import { calcLrProfit, lrVehicleNumber } from "./lr-summary";

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
