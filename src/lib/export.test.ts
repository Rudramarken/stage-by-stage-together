import { describe, it, expect } from "vitest";
import { exportFileName, money2 } from "./export";
import { toCSV } from "./format";

describe("export helpers", () => {
  it("builds a safe dated file name", () => {
    expect(exportFileName("LR / Bilty register", "2026-10-28")).toBe("LR-Bilty-register-2026-10-28.csv");
    expect(exportFileName("   ", "2026-10-28")).toBe("export-2026-10-28.csv");
  });
  it("formats money as plain 2-decimal text", () => {
    expect(money2(1234.5)).toBe("1234.50");
    expect(money2(null)).toBe("0.00");
    expect(money2("abc")).toBe("0.00");
  });
  it("neutralises spreadsheet formulas but keeps negative numbers", () => {
    expect(toCSV([["=SUM(A1)", "-12.50", "+91 98"]])).toBe("'=SUM(A1),-12.50,'+91 98");
  });
  it("quotes commas, quotes and newlines", () => {
    expect(toCSV([["a,b", 'say "hi"', "x\ny"]])).toBe('"a,b","say ""hi""","x\ny"');
  });
});
