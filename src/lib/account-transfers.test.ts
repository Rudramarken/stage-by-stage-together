import { describe, expect, it } from "vitest";
import { buildStatement, isReceiptType, type Movement } from "./accounts";

const mv = (over: Partial<Movement>): Movement => ({
  account_id: "a1", movement_date: "2026-10-01", created_at: "2026-10-01T00:00:00Z", source_table: "account_transfers",
  source_id: "t1", source_type: "transfer_in", direction: "in", amount: 0, reference: null, description: null,
  party_id: null, transporter_id: null, driver_id: null, other_name: null, ...over,
});

describe("transporter receipt type", () => {
  it("counts as money received, not paid", () => {
    expect(isReceiptType("transporter_receipt")).toBe(true);
    expect(isReceiptType("transporter_payment")).toBe(false);
  });
});

describe("account transfers in statements", () => {
  it("a transfer out reduces the source account and a transfer in raises the destination", () => {
    const source = buildStatement(1000, null, [mv({ direction: "out", source_type: "transfer_out", amount: 250 })]);
    expect(source.closing).toBe(750);
    expect(source.totWithdrawal).toBe(250);
    expect(source.totDeposit).toBe(0);
    const dest = buildStatement(100, null, [mv({ direction: "in", source_type: "transfer_in", amount: 250 })]);
    expect(dest.closing).toBe(350);
    expect(dest.totDeposit).toBe(250);
  });

  it("a transfer is never counted as a receipt from a party or a payment to one", () => {
    // Both sides of one transfer across two accounts net to zero overall: no false income/expense.
    const out = buildStatement(0, null, [mv({ direction: "out", amount: 500 })]);
    const inn = buildStatement(0, null, [mv({ direction: "in", amount: 500 })]);
    expect(out.closing + inn.closing).toBe(0);
  });
});
