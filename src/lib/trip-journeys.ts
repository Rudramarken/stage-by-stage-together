import { todayIST } from "./format";

export type JourneyExpense = { id: string; category: string; amount: string; expense_date: string; notes: string };
export type JourneyEntry = {
  id: string; saved?: boolean; journey: "main" | "return"; role: "consignor" | "consignee" | "transporter";
  party_id: string; transporter_id: string; weight: string; rate: string; freight_amount: string;
  shortage: string; addition: string; freight_date: string; goods_description: string;
  shortage_reason?: string; addition_reason?: string;
  loading_point: string; delivery_point: string; expenses: JourneyExpense[]; cancel_reason?: string; is_cancelled?: boolean;
};
export const blankJourneyEntry = (journey: JourneyEntry["journey"], role: JourneyEntry["role"]): JourneyEntry => ({
  id: crypto.randomUUID(), journey, role, party_id: "", transporter_id: "", weight: "", rate: "", freight_amount: "",
  shortage: "", addition: "", shortage_reason: "", addition_reason: "", freight_date: todayIST(), goods_description: "", loading_point: "", delivery_point: "", expenses: [],
});
export const blankJourney = (journey: JourneyEntry["journey"]) => (["consignor", "consignee", "transporter"] as const).map(role => blankJourneyEntry(journey, role));
export const journeyEntryUsed = (e: JourneyEntry) => !!(e.saved || e.party_id || e.transporter_id || e.goods_description || e.loading_point || e.delivery_point || e.expenses.length || [e.weight, e.rate, e.freight_amount, e.shortage, e.addition].some(v => String(v ?? "").trim()));
const validMoney = (v: string) => v === "" || (Number.isFinite(Number(v)) && Number(v) >= 0 && Math.abs(Number(v) * 100 - Math.round(Number(v) * 100)) < 1e-6);
export function validateJourneyEntries(entries: JourneyEntry[]): string | null {
  for (const e of entries.filter(journeyEntryUsed)) {
    if (e.cancel_reason) { if (!e.cancel_reason.trim()) return "Cancellation reason required"; continue; }
    const label = `${e.journey === "main" ? "Main" : "Return"} journey ${e.role}`;
    if (e.role === "transporter" ? !e.transporter_id : !e.party_id) return `${label}: choose ${e.role}`;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.freight_date)) return `${label}: enter a date`;
    if (![e.rate, e.freight_amount, e.shortage, e.addition].every(validMoney) || (e.weight !== "" && (!Number.isFinite(Number(e.weight)) || Number(e.weight) < 0))) return `${label}: enter valid non-negative amounts (money has at most two decimals)`;
    for (const x of e.expenses) if (!x.category.trim() || !validMoney(x.amount) || !(Number(x.amount) > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(x.expense_date)) return `${label}: each expense needs a category, positive amount and date`;
  }
  return null;
}
export function journeyEntriesPayload(entries: JourneyEntry[]) {
  return entries.filter(journeyEntryUsed).map(({ saved: _saved, ...e }) => ({ ...e, cancel: !!e.cancel_reason }));
}
export function journeyEntriesToForm(rows: any[]): JourneyEntry[] {
  return rows.filter(r => !r.is_cancelled).map(r => ({ ...r, saved: true, party_id: r.party_id ?? "", transporter_id: r.transporter_id ?? "",
    ...Object.fromEntries(["weight", "rate", "freight_amount", "shortage", "addition"].map(k => [k, r[k] == null ? "" : String(r[k])])),
    goods_description: r.goods_description ?? "", loading_point: r.loading_point ?? "", delivery_point: r.delivery_point ?? "", expenses: r.expenses ?? [],
  }));
}
export function journeyTotals(rows: any[]) {
  const active = rows.filter(r => !r.is_cancelled && !r.cancel_reason);
  const sum = (a: any[], field: string) => Math.round(a.reduce((s, r) => s + Number(r[field] || 0), 0) * 100) / 100;
  return { partyFreight: sum(active.filter(r => r.role !== "transporter"), "freight_amount"), transporterReceivable: sum(active.filter(r => r.role === "transporter"), "freight_amount"),
    consignorPayable: sum(active.flatMap(r => r.expenses ?? []), "amount") };
}