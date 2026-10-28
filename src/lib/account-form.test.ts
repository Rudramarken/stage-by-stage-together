import { describe, expect, it } from "vitest";
import { accountFormSchema } from "./account-form";
const input = { id: "e070ed76-e1ac-4b7c-81fa-9860837978fc", display_name: "TEST Bank", bank_name: "Test", account_number: "123456789", ifsc: "HDFC0001234", opening_balance: 500, opening_date: "2026-10-28" };
describe("account creation and opening edits", () => {
  it("requires an account name", () => expect(accountFormSchema.safeParse({ ...input, display_name: " " }).success).toBe(false));
  it("requires a date for a nonzero opening", () => expect(accountFormSchema.safeParse({ ...input, opening_date: "" }).success).toBe(false));
  it("permits zero opening without a date", () => expect(accountFormSchema.parse({ ...input, opening_balance: 0, opening_date: "" }).opening_date).toBeNull());
  it("supports overdraft opening balances", () => expect(accountFormSchema.parse({ ...input, opening_balance: -500 }).opening_balance).toBe(-500));
  it("rejects impossible dates", () => expect(accountFormSchema.safeParse({ ...input, opening_date: "2026-02-30" }).success).toBe(false));
  it("rejects fractional paise", () => expect(accountFormSchema.safeParse({ ...input, opening_balance: 1.234 }).success).toBe(false));
  it("rejects malformed IFSC", () => expect(accountFormSchema.safeParse({ ...input, ifsc: "BAD" }).success).toBe(false));
});