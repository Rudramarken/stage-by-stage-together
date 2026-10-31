import { z } from "zod";

export const driverTransactionSchema = z.object({
  id: z.string().uuid(), trip_id: z.string().uuid().nullable().optional(),
  driver_id: z.string().uuid(), kind: z.enum(["party_receipt", "expense"]),
  party_id: z.string().uuid().nullable().optional(),
  amount: z.coerce.number().finite().positive().refine(n => Math.abs(n * 100 - Math.round(n * 100)) < 0.000001, "Use at most two decimals"),
  entry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  account_id: z.string().uuid().nullable().optional(), payment_method: z.string().optional(),
  reference: z.string().optional(), notes: z.string().optional(),
}).superRefine((v, ctx) => {
  if (v.kind === "party_receipt" && !v.party_id) ctx.addIssue({ code: "custom", path: ["party_id"], message: "Choose the paying party" });
  if (v.kind === "party_receipt" && v.account_id) ctx.addIssue({ code: "custom", path: ["account_id"], message: "Direct party money cannot use a company account" });
});
export type DriverTransaction = z.infer<typeof driverTransactionSchema>;
export const driverPosting = (v: DriverTransaction) => ({
  driverDebit: v.kind === "party_receipt" || v.account_id ? v.amount : 0,
  driverCredit: v.kind === "expense" ? v.amount : 0,
  partyCredit: v.kind === "party_receipt" ? v.amount : 0,
  companyOut: v.kind === "expense" && v.account_id ? v.amount : 0,
});