import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { maskAccount } from "@/lib/format";

export const RECEIPT_TYPES = ["customer_receipt", "advance_received", "third_party_receipt"];
export const isReceiptType = (t: string) => RECEIPT_TYPES.includes(t);

export type AccountRow = { id: string; kind: "cash" | "bank"; display_name: string; account_number?: string | null; is_active: boolean; opening_balance?: number | string | null; opening_date?: string | null; system_key?: string | null };

/** One label everywhere. Cash accounts use their own name ("Cash", "Cash (Narinder)"), banks show the masked number. */
export function accountLabel(a: Pick<AccountRow, "kind" | "display_name" | "account_number"> | null | undefined): string {
  if (!a) return "—";
  return a.kind === "cash" ? a.display_name : `${a.display_name}${a.account_number ? ` ${maskAccount(a.account_number)}` : ""}`;
}

export type Movement = {
  account_id: string; movement_date: string; created_at: string; source_table: string; source_id: string; source_type: string;
  direction: "in" | "out"; amount: number | string; reference: string | null; description: string | null;
  party_id: string | null; transporter_id: string | null; driver_id: string | null; other_name: string | null;
};
export type Balance = { account_id: string; opening_balance: number | string; opening_date: string | null; receipts: number | string; payments: number | string; balance: number | string; entries_before_opening: number };
export type Unassigned = { source: string; entries: number; amount: number | string };

// The generated Supabase types do not know the Part 4 view/functions yet, so these calls are cast in this one place.
const db = supabase as any;

/** Reads every row (PostgREST returns at most 1000 per request, so a plain select would silently truncate). */
export async function fetchAllRows<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export const useAccountBalances = (asOf?: string) => useQuery({
  queryKey: ["account-balances", asOf ?? "now"],
  queryFn: async () => {
    const { data, error } = await db.rpc("account_balances_as_of", { p_as_of: asOf || null });
    if (error) throw new Error(error.message);
    return (data ?? []) as Balance[];
  },
});

export const useUnassignedOutflows = () => useQuery({
  queryKey: ["account-unassigned"],
  queryFn: async () => {
    const { data, error } = await db.rpc("account_unassigned_outflows");
    if (error) throw new Error(error.message);
    return ((data ?? []) as Unassigned[]).filter((r) => Number(r.entries) > 0);
  },
});

export const useAccountMovements = (accountId: string | undefined) => useQuery({
  queryKey: ["account-movements", accountId],
  enabled: !!accountId,
  queryFn: () => fetchAllRows<Movement>((from, to) => db.from("account_movements").select("*").eq("account_id", accountId)
    .order("movement_date", { ascending: true }).order("created_at", { ascending: true }).order("source_id", { ascending: true }).range(from, to)),
});

export const signed = (m: Pick<Movement, "direction" | "amount">) => (m.direction === "in" ? Number(m.amount) : -Number(m.amount));
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Pure statement maths (unit-tested). Movements dated before the opening date are ignored; the opening balance is counted once. */
export function buildStatement(opening: number, openingDate: string | null | undefined, movements: Movement[], from?: string, to?: string) {
  const live = movements
    .filter((m) => !openingDate || m.movement_date >= openingDate)
    .sort((a, b) => (a.movement_date === b.movement_date ? String(a.created_at).localeCompare(String(b.created_at)) || a.source_id.localeCompare(b.source_id) : a.movement_date.localeCompare(b.movement_date)));
  const start = r2(live.filter((m) => from && m.movement_date < from).reduce((s, m) => s + signed(m), opening));
  const inRange = live.filter((m) => (!from || m.movement_date >= from) && (!to || m.movement_date <= to));
  let run = start;
  const lines = inRange.map((m) => { run = r2(run + signed(m)); return { m, deposit: m.direction === "in" ? Number(m.amount) : 0, withdrawal: m.direction === "out" ? Number(m.amount) : 0, balance: run }; });
  return { start, closing: run, lines, totDeposit: r2(lines.reduce((s, l) => s + l.deposit, 0)), totWithdrawal: r2(lines.reduce((s, l) => s + l.withdrawal, 0)) };
}
