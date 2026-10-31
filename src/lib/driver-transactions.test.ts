import { describe, it, expect } from "vitest";
import { driverPosting, driverTransactionSchema } from "./driver-transactions";
const base = { id: "11111111-1111-4111-8111-111111111111", driver_id: "22222222-2222-4222-8222-222222222222", party_id: "33333333-3333-4333-8333-333333333333", amount: 15000, entry_date: "2026-10-31", kind: "party_receipt" as const };
describe("client driver accounting", () => {
  it("party's ₹15,000 reaches the driver and party, never company cash", () => expect(driverPosting(driverTransactionSchema.parse(base))).toEqual({ driverDebit: 15000, driverCredit: 0, partyCredit: 15000, companyOut: 0 }));
  it("rejects company account for direct party money", () => expect(driverTransactionSchema.safeParse({ ...base, account_id: base.id }).success).toBe(false));
  it("driver-incurred expense is a separate reimbursement liability", () => expect(driverPosting(driverTransactionSchema.parse({ ...base, kind: "expense", amount: 500, party_id: null }))).toEqual({ driverDebit: 0, driverCredit: 500, partyCredit: 0, companyOut: 0 }));
  it("reimbursed expense deducts company account once and settles driver", () => expect(driverPosting(driverTransactionSchema.parse({ ...base, kind: "expense", amount: 500, account_id: base.id, party_id: null }))).toEqual({ driverDebit: 500, driverCredit: 500, partyCredit: 0, companyOut: 500 }));
});