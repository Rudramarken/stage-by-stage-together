import { describe, it, expect } from "vitest";
import { calcFreight } from "./freight";

describe("customer freight calculation", () => {
  it("5,000 kg × ₹2/kg = ₹10,000", () => {
    expect(calcFreight(5000, "kg", 2, "per_kg").final).toBe(10000);
  });
  it("50 quintal × ₹200/quintal = ₹10,000", () => {
    expect(calcFreight(50, "quintal", 200, "per_quintal").final).toBe(10000);
  });
  it("5 tonne × ₹2,000/tonne = ₹10,000", () => {
    expect(calcFreight(5, "tonne", 2000, "per_tonne").final).toBe(10000);
  });
  it("fixed ₹18,100 with 30 tonne stays ₹18,100", () => {
    expect(calcFreight(30, "tonne", 18100, "fixed").final).toBe(18100);
  });
  it("₹10,000 + ₹500 − ₹300 = ₹10,200, and recomputing does not apply adjustments twice", () => {
    const adj = [{ kind: "add" as const, amount: 500, reason: "Extra loading" }, { kind: "deduct" as const, amount: 300, reason: "Damage" }];
    const first = calcFreight(5000, "kg", 2, "per_kg", adj).final;
    const second = calcFreight(5000, "kg", 2, "per_kg", adj).final;
    const third = calcFreight(5000, "kg", 2, "per_kg", adj).final;
    expect([first, second, third]).toEqual([10200, 10200, 10200]);
  });
  it("converts weight units across rate units (50 quintal at ₹2/kg = ₹10,000)", () => {
    expect(calcFreight(50, "quintal", 2, "per_kg").final).toBe(10000);
  });
});
