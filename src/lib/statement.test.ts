import { describe, it, expect } from "vitest";
import { buildLedgerStatement, monthRange, resolvePeriod, statementExport, tableToCsvRows, type LedgerRow } from "./statement";
import { toSpreadsheetML } from "./export";

let n = 0;
const row = (entry_date: string, debit: number, credit: number, o: Partial<LedgerRow> = {}): LedgerRow =>
  ({ id: `r${++n}`, entry_date, debit, credit, description: "x", created_at: `${entry_date}T00:00:00Z`, ...o });

// A party: opening 1,000 receivable on 01-03, LR freight 5,000 on 10-03, receipt 2,000 on 20-03, LR 3,000 on 05-04, receipt 1,500 on 30-04, LR 700 on 02-05.
const rows = [
  row("2026-03-01", 1000, 0, { line_kind: "opening_balance", description: "Opening balance" }),
  row("2026-03-10", 5000, 0), row("2026-03-20", 0, 2000),
  row("2026-04-05", 3000, 0), row("2026-04-30", 0, 1500), row("2026-05-02", 700, 0),
];

describe("buildLedgerStatement", () => {
  it("all history: opening 0, opening-balance row shown once as a line, closing = sum", () => {
    const s = buildLedgerStatement(rows);
    expect(s.opening).toBe(0);
    expect(s.lines[0].row.line_kind).toBe("opening_balance");
    expect(s.totalDebit).toBe(9700);
    expect(s.totalCredit).toBe(3500);
    expect(s.closing).toBe(6200);
    expect(s.lines.at(-1)!.balance).toBe(s.closing);
  });
  it("April: opening = everything before 01-04, totals of April only, closing reconciles", () => {
    const { from, to } = monthRange(2026, 4);
    const s = buildLedgerStatement(rows, from, to);
    expect(s.opening).toBe(4000);          // 1000 + 5000 - 2000
    expect(s.totalDebit).toBe(3000);
    expect(s.totalCredit).toBe(1500);
    expect(s.closing).toBe(5500);          // 4000 + 3000 - 1500
    expect(s.closing).toBe(s.opening + s.totalDebit - s.totalCredit);
    expect(s.lines.map((l) => l.balance)).toEqual([7000, 5500]);
    expect(s.rowsAfterPeriod).toBe(1);
  });
  it("consecutive months chain: closing of March = opening of April", () => {
    const mar = buildLedgerStatement(rows, ...(Object.values(monthRange(2026, 3)) as [string, string]));
    const apr = buildLedgerStatement(rows, ...(Object.values(monthRange(2026, 4)) as [string, string]));
    expect(mar.closing).toBe(apr.opening);
  });
  it("opening-balance row dated the first day of the period is the opening, not a movement", () => {
    const s = buildLedgerStatement(rows, "2026-03-01", "2026-03-31");
    expect(s.opening).toBe(1000);
    expect(s.lines.some((l) => l.row.line_kind === "opening_balance")).toBe(false);
    expect(s.closing).toBe(4000);
  });
  it("opening-balance row dated inside the period is listed once and counted once", () => {
    const s = buildLedgerStatement(rows, "2026-02-01", "2026-03-31");
    expect(s.opening).toBe(0);
    expect(s.lines.filter((l) => l.row.line_kind === "opening_balance").length).toBe(1);
    expect(s.closing).toBe(4000);
  });
  it("ignores cleared (0/0) rows and handles payable (negative) balances", () => {
    const t = [row("2026-01-01", 0, 0, { line_kind: "opening_balance" }), row("2026-01-02", 0, 800), row("2026-01-03", 300, 0)];
    const s = buildLedgerStatement(t);
    expect(s.lines.length).toBe(2);
    expect(s.closing).toBe(-500);
  });
  it("is deterministic for same-day rows and rounds to paise", () => {
    const t = [row("2026-01-01", 0.1, 0, { id: "b" }), row("2026-01-01", 0.2, 0, { id: "a" })];
    const s = buildLedgerStatement(t);
    expect(s.lines.map((l) => l.row.id)).toEqual(["a", "b"]);
    expect(s.closing).toBe(0.3);
  });
});

describe("resolvePeriod", () => {
  const base = { mode: "all" as const, year: 2026, month: 2, from: "", to: "" };
  it("month handles leap years and month ends", () => {
    expect(monthRange(2028, 2)).toEqual({ from: "2028-02-01", to: "2028-02-29" });
    expect(monthRange(2026, 2).to).toBe("2026-02-28");
    expect(resolvePeriod({ ...base, mode: "month", month: 4 }).to).toBe("2026-04-30");
  });
  it("rejects a reversed custom range", () => {
    expect(resolvePeriod({ ...base, mode: "range", from: "2026-05-01", to: "2026-04-01" }).error).toBeTruthy();
  });
  it("all history has no bounds", () => {
    const p = resolvePeriod(base);
    expect(p.from).toBeUndefined(); expect(p.to).toBeUndefined();
  });
});

describe("export rows match the statement", () => {
  const s = buildLedgerStatement(rows, "2026-04-01", "2026-04-30");
  const t = statementExport(s, { accountName: "ABC Traders", accountKind: "Party", periodLabel: "April 2026", convention: "Balance = Debit - Credit", referenceOf: () => "REF" });
  it("has opening, every line, totals and closing", () => {
    const flat = t.rows.map((r) => r.join("|"));
    expect(flat.some((r) => r.includes("Opening balance") && r.includes("4000"))).toBe(true);
    expect(flat.some((r) => r.includes("Period totals") && r.includes("3000") && r.includes("1500"))).toBe(true);
    expect(flat.some((r) => r.includes("Closing balance") && r.includes("5500") && r.includes("Receivable"))).toBe(true);
    expect(t.rows.filter((r) => r[2] === "REF").length).toBe(s.lines.length);
  });
  it("csv money cells are 2-decimal text, excel cells are numbers", () => {
    const csv = tableToCsvRows(t);
    expect(csv.at(-1)![5]).toBe("5500.00");
    const xml = toSpreadsheetML("Statement", t.rows, t.moneyCols);
    expect(xml).toContain('<Data ss:Type="Number">5500</Data>');
    expect(xml).toContain("ABC Traders");
  });
  it("excel escapes XML and keeps leading zeros as text", () => {
    const xml = toSpreadsheetML("a/b[c]", [["00123", "<&>\"", 5]], [2]);
    expect(xml).toContain('<Data ss:Type="String">00123</Data>');
    expect(xml).toContain("&lt;&amp;&gt;&quot;");
    expect(xml).toContain('ss:Name="a b c"');
  });
});
