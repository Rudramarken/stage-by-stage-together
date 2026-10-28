import { z } from "zod";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null);
export const accountFormSchema = z
  .object({
    id: z.string().uuid(),
    display_name: z.string().trim().min(1, "Account name is required").max(150),
    bank_name: optionalText(150),
    account_number: z
      .string()
      .trim()
      .max(40)
      .regex(/^[A-Za-z0-9 -]*$/, "Enter a valid account number")
      .transform((v) => v || null),
    ifsc: z
      .string()
      .trim()
      .toUpperCase()
      .refine(
        (v) => !v || /^[A-Z]{4}0[A-Z0-9]{6}$/.test(v),
        "IFSC must have 11 characters, for example HDFC0001234",
      )
      .transform((v) => v || null),
    opening_balance: z.coerce
      .number()
      .finite()
      .min(-999999999999.99)
      .max(999999999999.99)
      .refine(
        (v) => Math.abs(v * 100 - Math.round(v * 100)) < 0.001,
        "Opening balance can have at most two decimal places",
      ),
    opening_date: z
      .string()
      .refine(
        (v) =>
          !v ||
          (/^\d{4}-\d{2}-\d{2}$/.test(v) &&
            !Number.isNaN(Date.parse(v)) &&
            new Date(v).toISOString().slice(0, 10) === v),
        "Enter a valid opening date",
      )
      .transform((v) => v || null),
  })
  .superRefine((v, ctx) => {
    if (v.opening_balance !== 0 && !v.opening_date)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["opening_date"],
        message: "Opening date is required when an opening balance is entered",
      });
  });

export type AccountFormInput = z.input<typeof accountFormSchema>;
