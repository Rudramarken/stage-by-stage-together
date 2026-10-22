import { describe, it, expect } from "vitest";
import { formatINR, formatDate, maskAccount, balanceLabel, toCSV } from "./format";

describe("format rules", () => {
  it("uses Indian digit grouping", () => {
    expect(formatINR(1234567.5)).toBe("₹12,34,567.50");
  });
  it("shows dates as DD/MM/YYYY", () => {
    expect(formatDate("2026-10-22")).toBe("22/10/2026");
  });
  it("masks bank account numbers to last 4 digits", () => {
    expect(maskAccount("123456789012")).toBe("XXXX9012");
  });
  it("labels positive balance as receivable and negative as payable", () => {
    expect(balanceLabel(7000).text).toContain("Receivable");
    expect(balanceLabel(-500).text).toContain("Payable");
  });
  it("escapes CSV cells", () => {
    expect(toCSV([["a,b", 1]])).toBe('"a,b",1');
  });
});
