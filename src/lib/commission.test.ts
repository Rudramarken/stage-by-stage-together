import { describe, expect, it } from "vitest";
import { commissionTotals, validateCommissionReceipt, salaryRecovery } from "./commission";

describe("driver commission rules", () => {
  it("adds ₹1,000 to ₹5,000 owed, without pending income", () => {
    const t = commissionTotals(1000, 0);
    expect(5000 + t.pending).toBe(6000);
    expect(t.received).toBe(0);
  });
  it("editing to ₹1,200 changes the outstanding amount", () => {
    expect(5000 + commissionTotals(1200, 0).pending).toBe(6200);
  });
  it("partial ₹400 then ₹800 receipts reduce pending and driver debt", () => {
    expect(commissionTotals(1200, 400)).toEqual({ due: 1200, received: 400, pending: 800 });
    expect(5000 + commissionTotals(1200, 400).pending).toBe(5800);
    expect(commissionTotals(1200, 1200).pending).toBe(0);
    expect(validateCommissionReceipt(801, 800)).toBe(false);
    expect(validateCommissionReceipt(1, 0)).toBe(false);
  });
  it("off/cancelled commissions have no pending amount", () => {
    expect(commissionTotals(1000, 0, true).pending).toBe(0);
  });
  it("suggests ₹9,000 payable only after confirmation", () => {
    expect(salaryRecovery(15000, 5000, 1000, false)).toEqual({ advance: 0, commission: 0, payable: 15000 });
    expect(salaryRecovery(15000, 5000, 1000, true)).toEqual({ advance: 5000, commission: 1000, payable: 9000 });
  });
});