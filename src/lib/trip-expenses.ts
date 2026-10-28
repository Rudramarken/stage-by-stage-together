// Pure helpers (no network, no React) for the expense and driver-advance sections of the Trip form, so they can be unit-tested.
// The database stays the single source of truth: every row is matched by its id, so saving the same trip again updates the same records.

export const FIXED_EXPENSES = [
  { key: "toll", category: "TOLL TAX", aliases: ["TOLL TAX", "TOLL"] },
  { key: "cng", category: "CNG", aliases: ["CNG"] },
  { key: "food", category: "FOOD", aliases: ["FOOD", "DRIVER FOOD"] },
  { key: "police", category: "POLICE", aliases: ["POLICE"] },
] as const;
export type FixedKey = (typeof FIXED_EXPENSES)[number]["key"];

/** Categories offered under "Add expense". Existing records keep whatever category they were saved with. */
export const EXTRA_EXPENSE_CATEGORIES = ["Diesel/Fuel", "Loading", "Unloading", "Parking", "Repairs", "Other"];

export type ExpenseRow = {
  id: string; category: string; amount: string; expense_date: string; paid_to: string; notes: string;
  saved: boolean; cancelReason?: string;
};
export type ExpenseForm = { fixed: Record<FixedKey, ExpenseRow>; extra: ExpenseRow[] };

export type AdvanceRow = {
  id: string; driver_id: string; amount: string; advance_date: string; payment_method: string; account_id: string; reference: string; notes: string;
  saved: boolean; cancelReason?: string;
};

const norm = (s: unknown) => String(s ?? "").trim().toUpperCase();
const str = (v: unknown) => (v == null ? "" : String(v));
export const newId = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : "00000000-0000-4000-8000-" + Math.random().toString(16).slice(2).padEnd(12, "0").slice(0, 12));

export function blankExpense(category = "", date = ""): ExpenseRow {
  return { id: newId(), category, amount: "", expense_date: date, paid_to: "", notes: "", saved: false };
}

function rowFromDb(e: any): ExpenseRow {
  return { id: e.id, category: str(e.category), amount: str(e.amount), expense_date: str(e.expense_date), paid_to: str(e.paid_to), notes: str(e.notes), saved: true };
}

/** Build the form state from the trip's saved, non-cancelled, trip-scope expenses. Nothing is hidden: a second record in the same fixed category is shown under "Additional expenses". */
export function expensesToForm(rows: any[] | null | undefined, tripDate = "", mk: (cat: string, date: string) => ExpenseRow = blankExpense): ExpenseForm {
  const fixed = {} as Record<FixedKey, ExpenseRow>;
  for (const f of FIXED_EXPENSES) fixed[f.key] = mk(f.category, tripDate);
  const extra: ExpenseRow[] = [];
  const usedFixed = new Set<FixedKey>();
  for (const e of rows ?? []) {
    if (e.is_cancelled) continue;
    const f = FIXED_EXPENSES.find((x) => (x.aliases as readonly string[]).includes(norm(e.category)));
    if (f && !usedFixed.has(f.key)) { fixed[f.key] = rowFromDb(e); usedFixed.add(f.key); } else extra.push(rowFromDb(e));
  }
  return { fixed, extra };
}

export function advancesToForm(rows: any[] | null | undefined): AdvanceRow[] {
  return (rows ?? []).filter((a) => !a.is_cancelled && a.recipient_type === "driver").map((a) => ({
    id: a.id, driver_id: str(a.driver_id), amount: str(a.amount), advance_date: str(a.advance_date), payment_method: str(a.payment_method), account_id: str(a.account_id),
    reference: str(a.reference), notes: str(a.notes), saved: true,
  }));
}

export function blankAdvance(date: string): AdvanceRow {
  return { id: newId(), driver_id: "", amount: "", advance_date: date, payment_method: "cash", account_id: "", reference: "", notes: "", saved: false };
}

/** null when the text is not a valid positive rupee amount with at most 2 decimals. */
export function parseAmount(text: string): number | null {
  const t = String(text ?? "").trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0 || n > 9999999999999) return null;
  if (Math.abs(Math.round(n * 100) - n * 100) > 1e-6) return null;
  return n;
}

const hasContent = (r: ExpenseRow) => r.amount.trim() !== "" || r.paid_to.trim() !== "" || r.notes.trim() !== "";
const allExpenseRows = (f: ExpenseForm) => [...FIXED_EXPENSES.map((x) => f.fixed[x.key]), ...f.extra];

export function validateExpenses(f: ExpenseForm): string | null {
  for (const x of FIXED_EXPENSES) {
    const r = f.fixed[x.key];
    if (r.cancelReason) continue;
    if (r.amount.trim() === "") {
      if (r.saved) return `${x.category}: a saved expense cannot be blanked out. Use Cancel (with a reason) to remove it.`;
      if (r.notes.trim()) return `${x.category}: enter an amount or clear the note`;
      continue;
    }
    if (parseAmount(r.amount) == null) return `${x.category}: enter an amount greater than 0 (at most 2 decimals)`;
  }
  for (const [i, r] of f.extra.entries()) {
    if (r.cancelReason) continue;
    if (!r.saved && !hasContent(r)) continue; // untouched new row: ignored
    if (!r.category.trim()) return `Additional expense ${i + 1}: choose a category`;
    if (r.amount.trim() === "") return r.saved ? `Additional expense ${i + 1} (${r.category}): a saved expense cannot be blanked out. Use Cancel (with a reason) to remove it.` : `Additional expense ${i + 1} (${r.category}): enter an amount`;
    if (parseAmount(r.amount) == null) return `Additional expense ${i + 1} (${r.category}): enter an amount greater than 0 (at most 2 decimals)`;
  }
  return null;
}

/** Rows sent to save_trip. Untouched blank new rows are omitted. Saved rows never lose existing details they are not edited here (only the keys we send are updated). */
export function expensesPayload(f: ExpenseForm, tripDate: string) {
  const out: Record<string, unknown>[] = [];
  const push = (r: ExpenseRow, fixed: boolean) => {
    if (r.cancelReason) { if (r.saved) out.push({ id: r.id, cancel: true, cancel_reason: r.cancelReason.trim() }); return; }
    if (!r.saved && !(fixed ? r.amount.trim() !== "" : hasContent(r))) return;
    const row: Record<string, unknown> = { id: r.id, category: r.category.trim(), amount: parseAmount(r.amount), notes: r.notes.trim() };
    if (!fixed) { row.paid_to = r.paid_to.trim(); row.expense_date = r.expense_date || tripDate; }
    if (!r.saved) { row.expense_date = r.expense_date || tripDate; row.payment_method = "cash"; }
    out.push(row);
  };
  for (const x of FIXED_EXPENSES) push(f.fixed[x.key], true);
  for (const r of f.extra) push(r, false);
  return out;
}

/** Total of the entries that will exist after saving (cancelled and blank rows excluded). */
export function expenseTotal(f: ExpenseForm): number {
  const t = allExpenseRows(f).reduce((s, r) => s + (r.cancelReason ? 0 : parseAmount(r.amount) ?? 0), 0);
  return Math.round(t * 100) / 100;
}

export function validateAdvances(rows: AdvanceRow[], tripDriverId: string | null | undefined): string | null {
  for (const [i, r] of rows.entries()) {
    if (r.cancelReason) continue;
    const label = `Driver advance ${i + 1}`;
    if (!r.saved && r.amount.trim() === "" && !r.reference.trim() && !r.notes.trim()) continue; // untouched new row
    if (parseAmount(r.amount) == null) return r.saved && r.amount.trim() === "" ? `${label}: a saved advance cannot be blanked out. Use Cancel (with a reason) to remove it.` : `${label}: enter an amount greater than 0 (at most 2 decimals)`;
    if (!r.advance_date) return `${label}: choose the date`;
    if (!r.saved && !tripDriverId) return `${label}: choose a registered driver in "Vehicle, transporter & driver". An advance to a typed driver name cannot reach any driver ledger.`;
  }
  return null;
}

export function advancesPayload(rows: AdvanceRow[], tripDriverId: string | null | undefined) {
  const out: Record<string, unknown>[] = [];
  for (const r of rows) {
    if (r.cancelReason) { if (r.saved) out.push({ id: r.id, cancel: true, cancel_reason: r.cancelReason.trim() }); continue; }
    if (!r.saved && r.amount.trim() === "" && !r.reference.trim() && !r.notes.trim()) continue;
    out.push({
      id: r.id, driver_id: r.saved ? r.driver_id : tripDriverId, amount: parseAmount(r.amount), advance_date: r.advance_date,
      payment_method: r.payment_method, account_id: r.account_id, reference: r.reference.trim(), notes: r.notes.trim(),
    });
  }
  return out;
}

export function advanceTotal(rows: AdvanceRow[]): number {
  return Math.round(rows.reduce((s, r) => s + (r.cancelReason ? 0 : parseAmount(r.amount) ?? 0), 0) * 100) / 100;
}
