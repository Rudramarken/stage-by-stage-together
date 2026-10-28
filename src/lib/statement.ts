// Pure statement maths for party / transporter / driver ledgers (no React, no network) so it can be unit-tested.
//
// Ledger convention used by the whole app (ledger_entries): balance = DEBIT - CREDIT.
//   positive = Receivable (the account owes Gokul), negative = Payable (Gokul owes the account).
// Parties: freight billed = debit, receipts = credit. Transporters: freight payable = credit, payments made = debit.
// The statement does not change that meaning; it only slices it by date.

export type LedgerRow = {
  id: string;
  entry_date: string; // YYYY-MM-DD
  description?: string | null;
  debit: number | string;
  credit: number | string;
  line_kind?: string | null;
  source_table?: string | null;
  source_id?: string | null;
  created_at?: string | null;
};

export type StatementLine<T extends LedgerRow> = { row: T; debit: number; credit: number; balance: number };
export type Statement<T extends LedgerRow> = {
  /** Balance brought forward to the first day of the period (0 when no start date is chosen). */
  opening: number;
  lines: StatementLine<T>[];
  totalDebit: number;
  totalCredit: number;
  /** opening + totalDebit - totalCredit. Always equals the last running balance. */
  closing: number;
  /** Rows of the account that exist but fall after the period (not in the numbers above). */
  rowsAfterPeriod: number;
};

export const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

function compareRows(a: LedgerRow, b: LedgerRow): number {
  if (a.entry_date !== b.entry_date) return a.entry_date < b.entry_date ? -1 : 1;
  const ca = String(a.created_at ?? ""), cb = String(b.created_at ?? "");
  if (ca !== cb) return ca < cb ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Statement for one account over [from, to] (either bound optional).
 * - Zero rows (cleared opening balances, reversed lines shown as 0) are ignored.
 * - Opening balance of the period = everything dated BEFORE `from`, plus the account's one 'opening_balance' ledger row
 *   when that row is dated on or before `from` (an opening balance dated the first day of the period is the opening, not a movement).
 * - The opening-balance row is never counted twice: it is either in the brought-forward figure or shown once as a line.
 */
export function buildLedgerStatement<T extends LedgerRow>(rows: T[], from?: string, to?: string): Statement<T> {
  const live = rows.filter((r) => num(r.debit) !== 0 || num(r.credit) !== 0).slice().sort(compareRows);
  let opening = 0;
  const inPeriod: T[] = [];
  let rowsAfterPeriod = 0;
  for (const r of live) {
    const isOpeningRow = r.line_kind === "opening_balance";
    const broughtForward = !!from && (r.entry_date < from || (isOpeningRow && r.entry_date <= from));
    if (broughtForward) { opening += num(r.debit) - num(r.credit); continue; }
    if (to && r.entry_date > to) { rowsAfterPeriod++; continue; }
    inPeriod.push(r);
  }
  opening = r2(opening);
  let run = opening;
  let totalDebit = 0, totalCredit = 0;
  const lines = inPeriod.map((r) => {
    const debit = r2(num(r.debit)), credit = r2(num(r.credit));
    totalDebit += debit; totalCredit += credit;
    run = r2(run + debit - credit);
    return { row: r, debit, credit, balance: run };
  });
  return { opening, lines, totalDebit: r2(totalDebit), totalCredit: r2(totalCredit), closing: r2(opening + totalDebit - totalCredit), rowsAfterPeriod };
}

// ---------------------------------------------------------------------------------------------------------
// Periods

export type PeriodMode = "all" | "month" | "year" | "range";
export type PeriodSelection = { mode: PeriodMode; year: number; month: number; from: string; to: string };
export type Period = { from?: string; to?: string; label: string; error?: string };

const pad = (n: number) => String(n).padStart(2, "0");
export const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function daysInMonth(year: number, month: number): number { return new Date(Date.UTC(year, month, 0)).getUTCDate(); }
export function monthRange(year: number, month: number): { from: string; to: string } {
  return { from: `${year}-${pad(month)}-01`, to: `${year}-${pad(month)}-${pad(daysInMonth(year, month))}` };
}
const ddmmyyyy = (iso: string) => { const [y, m, d] = iso.split("-"); return `${d}-${m}-${y}`; };

/** Turns the picker state into from/to dates + a label (DD-MM-YYYY). Invalid ranges return an error and no dates. */
export function resolvePeriod(sel: PeriodSelection): Period {
  switch (sel.mode) {
    case "all": return { label: "All available history" };
    case "month": {
      if (!(sel.year >= 1900 && sel.year <= 2200) || !(sel.month >= 1 && sel.month <= 12)) return { label: "", error: "Choose a valid month and year" };
      const r = monthRange(sel.year, sel.month);
      return { ...r, label: `${MONTH_NAMES[sel.month - 1]} ${sel.year} (${ddmmyyyy(r.from)} to ${ddmmyyyy(r.to)})` };
    }
    case "year": {
      if (!(sel.year >= 1900 && sel.year <= 2200)) return { label: "", error: "Choose a valid year" };
      return { from: `${sel.year}-01-01`, to: `${sel.year}-12-31`, label: `Year ${sel.year} (01-01-${sel.year} to 31-12-${sel.year})` };
    }
    default: {
      if (sel.from && sel.to && sel.from > sel.to) return { label: "", error: "The From date must not be after the To date" };
      const label = sel.from && sel.to ? `${ddmmyyyy(sel.from)} to ${ddmmyyyy(sel.to)}` : sel.from ? `From ${ddmmyyyy(sel.from)}` : sel.to ? `Up to ${ddmmyyyy(sel.to)}` : "All available history";
      return { from: sel.from || undefined, to: sel.to || undefined, label };
    }
  }
}

// ---------------------------------------------------------------------------------------------------------
// Rows for CSV / Excel (one source for both, built from the same Statement the screen shows)

export type Cell = string | number | null | undefined;
export type TableExport = { rows: Cell[][]; moneyCols: number[]; sheetName: string };

export function balanceWords(balance: number): "Receivable" | "Payable" | "Settled" {
  if (balance > 0.004) return "Receivable";
  if (balance < -0.004) return "Payable";
  return "Settled";
}
const fmtDate = (iso: string) => (iso ? ddmmyyyy(iso) : "");

export type StatementExportOpts = {
  accountName: string; accountKind: string; periodLabel: string;
  debitLabel?: string; creditLabel?: string; convention: string;
  referenceOf?: (r: LedgerRow) => string;
};

/** Metadata block, header, opening row, every line, totals and closing row. Money cells are numbers (see moneyCols). */
export function statementExport<T extends LedgerRow>(st: Statement<T>, o: StatementExportOpts): TableExport {
  const dL = o.debitLabel ?? "Debit", cL = o.creditLabel ?? "Credit";
  const meta: Cell[][] = [
    ["Account", o.accountName], ["Account type", o.accountKind], ["Period", o.periodLabel], ["Convention", o.convention], [],
  ];
  const header: Cell[] = ["Date", "Description", "Reference", `${dL} (INR)`, `${cL} (INR)`, "Balance (INR)", "Balance type"];
  const body: Cell[][] = [];
  body.push(["", "Opening balance (brought forward)", "", "", "", Math.abs(st.opening), balanceWords(st.opening)]);
  for (const l of st.lines) {
    body.push([fmtDate(l.row.entry_date), l.row.description ?? "", o.referenceOf?.(l.row) ?? "", l.debit || "", l.credit || "", Math.abs(l.balance), balanceWords(l.balance)]);
  }
  body.push(["", "Period totals", "", st.totalDebit, st.totalCredit, "", ""]);
  body.push(["", "Closing balance", "", "", "", Math.abs(st.closing), balanceWords(st.closing)]);
  const moneyCols = [3, 4, 5];
  return { rows: [...meta, header, ...body], moneyCols, sheetName: "Statement" };
}

/** CSV cells: money columns become 2-decimal text so Excel and accountants see the exact amounts. */
export function tableToCsvRows(t: TableExport): (string | number | null | undefined)[][] {
  const money = new Set(t.moneyCols);
  return t.rows.map((row) => row.map((c, i) => (typeof c === "number" && money.has(i) ? c.toFixed(2) : c)));
}
