// Party / Transporter History: reads every record genuinely linked to one party or transporter and assembles it.
// Links used (all real columns, nothing inferred):
//   ledger_entries.account_id (party / transporter)            -> opening balance, freight, payments, manual entries, commission, running balance
//   lr_parties.party_id / lrs.billing_party_id / lrs.commission_payer_party_id / lrs.transporter_id -> LR / Bilty
//   payments.party_id / payments.transporter_id                 -> receipts and payments, payments.lr_id / trip_id -> LR / trip
//   lrs.trip_id -> trips -> vehicle, driver;  commission_balances.transporter_id / lr_id -> commission
// Trip-level expenses and driver advances belong to the whole trip, not to one party, so they are shown as information only and never totalled.
import { fetchAllRows } from "@/lib/accounts";
import { supabase } from "@/integrations/supabase/client";
import { buildLedgerStatement, type LedgerRow, type Statement } from "@/lib/statement";
import { lrVehicleNumber } from "@/lib/lr-summary";

const sb = supabase as any;
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const chunk = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

export type EntityKind = "party" | "transporter";
export type Entity = { kind: EntityKind; id: string };
export type NamedId = { id: string; name: string };

/** Which party ids and transporter ids belong to the chosen name (a party that is also a transporter shows both accounts). Pure. */
export function resolveAccounts(entity: Entity, parties: any[], transporters: any[]): { parties: NamedId[]; transporters: NamedId[]; note: string } {
  const outP = new Map<string, string>(), outT = new Map<string, string>();
  const linkedTo = (p: any) => transporters.filter((t) => t.party_id === p.id || (!t.party_id && norm(t.name) === norm(p.name)));
  if (entity.kind === "party") {
    const p = parties.find((x) => x.id === entity.id);
    if (p) { outP.set(p.id, p.name); for (const t of linkedTo(p)) outT.set(t.id, t.name); }
  } else {
    const t = transporters.find((x) => x.id === entity.id);
    if (t) {
      outT.set(t.id, t.name);
      const p = t.party_id ? parties.find((x) => x.id === t.party_id) : parties.find((x) => norm(x.name) === norm(t.name));
      if (p) { outP.set(p.id, p.name); for (const t2 of linkedTo(p)) outT.set(t2.id, t2.name); }
    }
  }
  const note = outP.size && outT.size ? "This name is both a party and a transporter: both accounts are included." : "";
  return { parties: [...outP].map(([id, name]) => ({ id, name })), transporters: [...outT].map(([id, name]) => ({ id, name })), note };
}

export type Raw = {
  parties: NamedId[]; transporters: NamedId[];
  ledger: { account: EntityKind; accountId: string; name: string; rows: LedgerRow[] }[];
  lrs: Map<string, any>; lrParties: Map<string, any[]>; trips: Map<string, any>; payments: Map<string, any>;
  allocations: Map<string, number>; lrExpenses: Map<string, number>; tripExpenses: Map<string, number>; tripDriverAdvances: Map<string, number>;
  commissions: any[]; driverNames: Map<string, string>;
};

async function inChunks(table: string, select: string, col: string, ids: string[], extra?: (q: any) => any): Promise<any[]> {
  const out: any[] = [];
  for (const part of chunk(Array.from(new Set(ids)), 100)) {
    out.push(...await fetchAllRows<any>((a, b) => { let q = sb.from(table).select(select).in(col, part); if (extra) q = extra(q); return q.order("id").range(a, b); }));
  }
  return out;
}

const LR_SEL = "id, lr_number, lr_date, status, trip_id, loading_point, delivery_point, vehicle_number, driver_id, driver_name, final_freight, freight_payable, transporter_id, billing_party_id, commission_payer_party_id, commission_amount, commission_enabled, delivery_status";

/** Loads everything for one name. Every query is paginated (1000 per page) or chunked, so older records are never silently dropped. */
export async function loadHistory(acc: { parties: NamedId[]; transporters: NamedId[] }): Promise<Raw> {
  const pIds = acc.parties.map((p) => p.id), tIds = acc.transporters.map((t) => t.id);
  const ledger: Raw["ledger"] = [];
  for (const [account, list] of [["party", acc.parties], ["transporter", acc.transporters]] as const) {
    for (const a of list) {
      const rows = await fetchAllRows<any>((x, y) => sb.from("ledger_entries").select("id, entry_date, description, debit, credit, source_table, source_id, line_kind, created_at")
        .eq("account_type", account).eq("account_id", a.id).order("entry_date").order("created_at").order("id").range(x, y));
      ledger.push({ account, accountId: a.id, name: a.name, rows });
    }
  }
  const lrs = new Map<string, any>();
  const addLrs = (rows: any[]) => { for (const l of rows) lrs.set(l.id, l); };
  const lrIdSet = new Set<string>();
  if (pIds.length) {
    for (const r of await inChunks("lr_parties", "id, lr_id", "party_id", pIds)) lrIdSet.add(r.lr_id);
    addLrs(await inChunks("lrs", LR_SEL, "billing_party_id", pIds));
    addLrs(await inChunks("lrs", LR_SEL, "commission_payer_party_id", pIds));
  }
  if (tIds.length) addLrs(await inChunks("lrs", LR_SEL, "transporter_id", tIds));

  const payments = new Map<string, any>();
  const PAY_SEL = "id, payment_date, payment_type, amount, mode, reference, txn_reference, notes, lr_id, trip_id, is_reversed, party_id, transporter_id";
  if (pIds.length) for (const p of await inChunks("payments", PAY_SEL, "party_id", pIds)) payments.set(p.id, p);
  if (tIds.length) for (const p of await inChunks("payments", PAY_SEL, "transporter_id", tIds)) payments.set(p.id, p);

  // LRs reached through ledger lines or payments (for example an LR whose freight posted to this party) must be present too.
  for (const l of ledger) for (const r of l.rows) if (r.source_table === "lrs" && r.source_id) lrIdSet.add(r.source_id);
  for (const p of payments.values()) if (p.lr_id) lrIdSet.add(p.lr_id);
  const missing = [...lrIdSet].filter((id) => !lrs.has(id));
  if (missing.length) addLrs(await inChunks("lrs", LR_SEL, "id", missing));
  const lrIds = [...lrs.keys()];

  const lrParties = new Map<string, any[]>();
  for (const r of await inChunks("lr_parties", "id, lr_id, role, seq, party_id, freight_amount, parties(name)", "lr_id", lrIds)) {
    const a = lrParties.get(r.lr_id) ?? []; a.push(r); lrParties.set(r.lr_id, a);
  }
  const tripIds = [...new Set([...lrs.values()].map((l) => l.trip_id).concat([...payments.values()].map((p) => p.trip_id)).filter(Boolean))] as string[];
  const trips = new Map<string, any>();
  for (const t of await inChunks("trips", "id, trip_number, trip_date, driver_id, driver_name, market_vehicle_number, vehicle_mode, vehicles(registration_number)", "id", tripIds)) trips.set(t.id, t);
  const driverIds = [...new Set([...lrs.values()].map((l) => l.driver_id).concat([...trips.values()].map((t) => t.driver_id)).filter(Boolean))] as string[];
  const driverNames = new Map<string, string>();
  for (const d of await inChunks("drivers", "id, name", "id", driverIds)) driverNames.set(d.id, d.name);

  const allocations = new Map<string, number>();
  for (const a of await inChunks("payment_allocations", "id, payment_id, amount", "payment_id", [...payments.keys()])) allocations.set(a.payment_id, r2((allocations.get(a.payment_id) ?? 0) + Number(a.amount)));

  const lrExpenses = new Map<string, number>();
  for (const e of await inChunks("expenses", "id, lr_id, amount, scope", "lr_id", lrIds, (q) => q.eq("is_cancelled", false).in("scope", ["consignor", "consignee"]))) lrExpenses.set(e.lr_id, r2((lrExpenses.get(e.lr_id) ?? 0) + Number(e.amount)));
  const tripExpenses = new Map<string, number>();
  for (const e of await inChunks("expenses", "id, trip_id, amount", "trip_id", tripIds, (q) => q.eq("is_cancelled", false).eq("scope", "trip"))) tripExpenses.set(e.trip_id, r2((tripExpenses.get(e.trip_id) ?? 0) + Number(e.amount)));
  const tripDriverAdvances = new Map<string, number>();
  for (const a of await inChunks("advances", "id, trip_id, amount", "trip_id", tripIds, (q) => q.eq("is_cancelled", false).eq("recipient_type", "driver"))) tripDriverAdvances.set(a.trip_id, r2((tripDriverAdvances.get(a.trip_id) ?? 0) + Number(a.amount)));

  const comMap = new Map<string, any>();
  const COM_SEL = "id, lr_id, trip_id, transporter_id, commission_date, amount, received_amount, pending_amount, is_cancelled";
  if (tIds.length) for (const c of await inChunks("commission_balances", COM_SEL, "transporter_id", tIds)) comMap.set(c.id, c);
  for (const c of await inChunks("commission_balances", COM_SEL, "lr_id", lrIds)) comMap.set(c.id, c);

  return { parties: acc.parties, transporters: acc.transporters, ledger, lrs, lrParties, trips, payments, allocations, lrExpenses, tripExpenses, tripDriverAdvances, commissions: [...comMap.values()], driverNames };
}

// ---------------------------------------------------------------------------------------------------------
export type TxRow = {
  key: string; date: string; account: "Party" | "Transporter"; accountName: string; kind: string; description: string; reference: string;
  lrId: string | null; lrNo: string; tripId: string | null; tripNo: string; vehicle: string; driver: string; route: string; consignors: string; consignees: string;
  debit: number; credit: number; balance: number;
};
export type LrRow = {
  id: string; date: string; roles: string; lrNo: string; tripId: string | null; tripNo: string; vehicle: string; driver: string; route: string; consignors: string; consignees: string;
  shareFreight: number; lrFreight: number; payable: number; commission: number; lrExpenses: number; tripExpenses: number; tripDriverAdvance: number; status: string; delivery: string;
};
export type History = {
  statements: { label: string; account: EntityKind; name: string; st: Statement<LedgerRow> }[];
  tx: TxRow[]; lrRows: LrRow[];
  commission: { earned: number; received: number; pending: number };
  limits: string[];
};

const KIND_LABEL: Record<string, string> = {
  opening_balance: "Opening balance", freight: "Freight billed", freight_payable: "Freight payable", direct_payment: "Direct payment by consignee", payment: "Payment / receipt",
  advance: "Advance", manual: "Manual entry", manual_reversal: "Manual entry reversal", commission: "Commission", commission_receipt: "Commission receipt",
};
const kindLabel = (k: string | null | undefined) => KIND_LABEL[String(k ?? "")] ?? String(k ?? "").replace(/_/g, " ");
const names = (list: any[] | undefined, role: string) => (list ?? []).filter((p) => p.role === role).sort((a, b) => a.seq - b.seq).map((p) => p.parties?.name).filter(Boolean).join(", ");

/** Pure: turns the loaded records into statements, a chronological transaction table and the LR table for [from, to]. */
export function assembleHistory(raw: Raw, from?: string, to?: string): History {
  const inP = (d: string | null | undefined) => (!from || (d ?? "") >= from) && (!to || (d ?? "") <= to);
  const lrInfo = (id: string | null | undefined) => {
    const l = id ? raw.lrs.get(id) : null;
    if (!l) return { lrNo: "", tripId: null as string | null, tripNo: "", vehicle: "", driver: "", route: "", consignors: "", consignees: "" };
    const t = l.trip_id ? raw.trips.get(l.trip_id) : null;
    const lp = raw.lrParties.get(l.id);
    return {
      lrNo: l.lr_number ?? "", tripId: l.trip_id ?? null, tripNo: t?.trip_number ?? "",
      vehicle: lrVehicleNumber({ vehicle_number: l.vehicle_number, trips: t ? { market_vehicle_number: t.market_vehicle_number, vehicles: t.vehicles } : null }) ?? "",
      driver: t?.driver_name || raw.driverNames.get(t?.driver_id ?? "") || l.driver_name || raw.driverNames.get(l.driver_id ?? "") || "",
      route: [l.loading_point, l.delivery_point].filter(Boolean).join(" → "), consignors: names(lp, "consignor"), consignees: names(lp, "consignee"),
    };
  };

  const statements: History["statements"] = [];
  const tx: TxRow[] = [];
  for (const a of raw.ledger) {
    const st = buildLedgerStatement(a.rows, from, to);
    statements.push({ label: a.account === "party" ? "Party account" : "Transporter account", account: a.account, name: a.name, st });
    for (const line of st.lines) {
      const r = line.row as LedgerRow & { source_table?: string | null; source_id?: string | null };
      let lrId: string | null = null, tripId: string | null = null, reference = "";
      if (r.source_table === "lrs") { lrId = r.source_id ?? null; reference = raw.lrs.get(lrId ?? "")?.lr_number ?? ""; }
      else if (r.source_table === "payments") { const p = raw.payments.get(r.source_id ?? ""); lrId = p?.lr_id ?? null; tripId = p?.trip_id ?? null; reference = p?.reference || p?.txn_reference || ""; }
      const info = lrInfo(lrId);
      tx.push({
        key: `${a.account}-${a.accountId}-${r.id}`, date: r.entry_date, account: a.account === "party" ? "Party" : "Transporter", accountName: a.name, kind: kindLabel(r.line_kind),
        description: r.description ?? "", reference, lrId, lrNo: info.lrNo, tripId: info.tripId ?? tripId, tripNo: info.tripNo || (tripId ? raw.trips.get(tripId)?.trip_number ?? "" : ""),
        vehicle: info.vehicle, driver: info.driver, route: info.route, consignors: info.consignors, consignees: info.consignees,
        debit: line.debit, credit: line.credit, balance: line.balance,
      });
    }
  }
  tx.sort((x, y) => (x.date === y.date ? x.key.localeCompare(y.key) : x.date < y.date ? -1 : 1));

  const pSet = new Set(raw.parties.map((p) => p.id)), tSet = new Set(raw.transporters.map((t) => t.id));
  const lrRows: LrRow[] = [];
  for (const l of raw.lrs.values()) {
    if (!inP(l.lr_date)) continue;
    const roles: string[] = [];
    const lp = raw.lrParties.get(l.id) ?? [];
    if (lp.some((p) => pSet.has(p.party_id) && p.role === "consignor")) roles.push("Consignor");
    if (lp.some((p) => pSet.has(p.party_id) && p.role === "consignee")) roles.push("Consignee");
    if (pSet.has(l.billing_party_id)) roles.push("Billing party");
    if (pSet.has(l.commission_payer_party_id)) roles.push("Commission payer");
    if (tSet.has(l.transporter_id)) roles.push("Transporter");
    if (!roles.length) continue; // reached only through a ledger line or payment: it is already in the transaction table
    const info = lrInfo(l.id);
    const share = lp.filter((p) => pSet.has(p.party_id)).reduce((s, p) => s + Number(p.freight_amount || 0), 0);
    lrRows.push({
      id: l.id, date: l.lr_date, roles: roles.join(" / "), lrNo: info.lrNo, tripId: info.tripId, tripNo: info.tripNo, vehicle: info.vehicle, driver: info.driver, route: info.route,
      consignors: info.consignors, consignees: info.consignees, shareFreight: r2(share), lrFreight: Number(l.final_freight || 0), payable: Number(l.freight_payable || 0),
      commission: l.commission_enabled ? Number(l.commission_amount || 0) : 0, lrExpenses: raw.lrExpenses.get(l.id) ?? 0,
      tripExpenses: l.trip_id ? raw.tripExpenses.get(l.trip_id) ?? 0 : 0, tripDriverAdvance: l.trip_id ? raw.tripDriverAdvances.get(l.trip_id) ?? 0 : 0,
      status: l.status === "cancelled" ? "Cancelled" : "Active", delivery: l.delivery_status ?? "",
    });
  }
  lrRows.sort((a, b) => (a.date === b.date ? a.lrNo.localeCompare(b.lrNo) : a.date < b.date ? -1 : 1));

  const live = raw.commissions.filter((c) => !c.is_cancelled && inP(c.commission_date));
  const sum = (k: string) => r2(live.reduce((s, c) => s + Number(c[k] || 0), 0));
  return {
    statements, tx, lrRows, commission: { earned: sum("amount"), received: sum("received_amount"), pending: sum("pending_amount") },
    limits: [
      "LR freight and payable are whole-LR amounts; \"Party freight share\" is the amount recorded against this name on the LR (lr_parties.freight_amount).",
      "Trip expenses and trip driver advances belong to the whole trip, not to one party, so they are shown for information and are not part of any balance.",
      "Vehicle and driver come from the LR's trip (or the LR itself); route is the LR's loading and delivery points. Trip stops are not used.",
    ],
  };
}
