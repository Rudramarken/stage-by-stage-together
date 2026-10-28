import { describe, expect, it } from "vitest";
import { summarizeTransporterLines } from "./transporter-ledger";

describe("transporter manual accounting", () => {
  it("a credit increases payable without becoming freight or cash", () => {
    expect(summarizeTransporterLines([{ line_kind: "manual", debit: 0, credit: 100 }])).toEqual({ opening: 0, freight: 0, adjustments: 100, paid: 0, commissionDue: 0, remaining: 100 });
  });
  it("a debit reduces payable", () => {
    expect(summarizeTransporterLines([{ line_kind: "manual", debit: 40, credit: 0 }]).remaining).toBe(-40);
  });
  it("a reversal offsets the original exactly once", () => {
    expect(summarizeTransporterLines([{ line_kind: "manual", debit: 0, credit: 100 }, { line_kind: "manual_reversal", debit: 100, credit: 0 }]).remaining).toBe(0);
  });
});