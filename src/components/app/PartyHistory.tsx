import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Money, StatusBadge } from "./ui";
import { LoadingState, ErrorState, EmptyState } from "./states";
import { selectCls } from "./Section";
import { formatDate } from "@/lib/format";
import { exportRows, money2 } from "@/lib/export";
import { lrVehicleNumber } from "@/lib/lr-summary";

export type HistoryRow = {
  key: string; date: string; type: "lr" | "payment"; kind: string; ref: string; refLrId: string | null; tripId: string | null; tripNo: string;
  vehicle: string; driver: string; route: string; amount: number; amountLabel: string; status: string;
};

const PAYMENT_LABEL: Record<string, string> = {
  customer_receipt: "Receipt from customer", transporter_payment: "Payment to transporter", advance_paid: "Advance paid",
  advance_received: "Advance received", third_party_receipt: "Third-party receipt",
};
const chunk = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

/** Pure: apply the page filters. Exported for tests. */
export function filterHistory(rows: HistoryRow[], f: { search: string; type: string; from: string; to: string }): HistoryRow[] {
  const s = f.search.trim().toLowerCase();
  return rows.filter((r) => {
    if (f.type && r.type !== f.type) return false;
    if (f.from && r.date < f.from) return false;
    if (f.to && r.date > f.to) return false;
    if (!s) return true;
    return [r.ref, r.tripNo, r.vehicle, r.driver, r.route, r.kind].join(" ").toLowerCase().includes(s);
  });
}

const PAGE = 25;

/**
 * Trace of the records actually linked to one party (and, optionally, its linked transporter accounts):
 * LRs (as consignor / consignee / billing party / commission payer / transporter) and payments or receipts.
 * It lists transactions only. Balances come from the ledger (ledger_entries) shown beside it, so nothing is summed twice here.
 */
export function PartyHistory({ partyId, transporterIds = [], title }: { partyId: string; transporterIds?: string[]; title: string }) {
  const [f, setF] = useState({ search: "", type: "", from: "", to: "" });
  const [page, setPage] = useState(0);
  const tKey = transporterIds.join(",");
  const q = useQuery({
    queryKey: ["party-history", partyId, tKey],
    queryFn: async (): Promise<HistoryRow[]> => {
      const sb = supabase as any;
      const roleByLr = new Map<string, Set<string>>();
      const addRole = (lrId: string, role: string) => { const s = roleByLr.get(lrId) ?? new Set<string>(); s.add(role); roleByLr.set(lrId, s); };

      const lp = await sb.from("lr_parties").select("lr_id, role").eq("party_id", partyId);
      if (lp.error) throw lp.error;
      for (const r of lp.data ?? []) addRole(r.lr_id, r.role === "consignor" ? "Consignor" : "Consignee");
      const sel = "id, lr_number, lr_date, status, trip_id, loading_point, delivery_point, vehicle_number, driver_name, final_freight, freight_payable, transporter_id, trips(trip_number, driver_name, market_vehicle_number, vehicles(registration_number))";
      const extra = [
        { col: "billing_party_id", role: "Billing party", val: [partyId] },
        { col: "commission_payer_party_id", role: "Commission payer", val: [partyId] },
        ...(transporterIds.length ? [{ col: "transporter_id", role: "Transporter", val: transporterIds }] : []),
      ];
      const lrMap = new Map<string, any>();
      for (const e of extra) {
        const res = await sb.from("lrs").select(sel).in(e.col, e.val);
        if (res.error) throw res.error;
        for (const l of res.data ?? []) { lrMap.set(l.id, l); addRole(l.id, e.role); }
      }
      const ids = Array.from(roleByLr.keys()).filter((id) => !lrMap.has(id));
      for (const part of chunk(ids, 100)) {
        const res = await sb.from("lrs").select(sel).in("id", part);
        if (res.error) throw res.error;
        for (const l of res.data ?? []) lrMap.set(l.id, l);
      }

      const payFilters = [{ col: "party_id", val: [partyId] }, ...(transporterIds.length ? [{ col: "transporter_id", val: transporterIds }] : [])];
      const payMap = new Map<string, any>();
      for (const pf of payFilters) {
        const res = await sb.from("payments").select("id, payment_date, payment_type, amount, mode, reference, lr_id, trip_id, is_reversed").in(pf.col, pf.val);
        if (res.error) throw res.error;
        for (const p of res.data ?? []) payMap.set(p.id, p);
      }
      const lrNo = new Map<string, any>(Array.from(lrMap.values()).map((l) => [l.id, l]));

      const rows: HistoryRow[] = [];
      for (const l of lrMap.values()) {
        rows.push({
          key: `lr-${l.id}`, date: l.lr_date, type: "lr", kind: `LR · ${Array.from(roleByLr.get(l.id) ?? []).join(" / ")}`, ref: l.lr_number, refLrId: l.id,
          tripId: l.trip_id, tripNo: l.trips?.trip_number ?? "", vehicle: lrVehicleNumber(l) ?? "", driver: l.trips?.driver_name ?? l.driver_name ?? "",
          route: [l.loading_point, l.delivery_point].filter(Boolean).join(" → "), amount: Number(l.final_freight || 0),
          amountLabel: "LR freight", status: l.status === "cancelled" ? "Cancelled" : "Active",
        });
      }
      for (const p of payMap.values()) {
        const lr = p.lr_id ? lrNo.get(p.lr_id) : null;
        rows.push({
          key: `pay-${p.id}`, date: p.payment_date, type: "payment", kind: PAYMENT_LABEL[p.payment_type] ?? p.payment_type, ref: p.reference || (lr?.lr_number ?? ""), refLrId: p.lr_id,
          tripId: p.trip_id, tripNo: lr?.trips?.trip_number ?? "", vehicle: lr ? lrVehicleNumber(lr) ?? "" : "", driver: lr?.trips?.driver_name ?? lr?.driver_name ?? "",
          route: lr ? [lr.loading_point, lr.delivery_point].filter(Boolean).join(" → ") : "", amount: Number(p.amount || 0), amountLabel: `Paid via ${p.mode}`,
          status: p.is_reversed ? "Reversed" : "Posted",
        });
      }
      return rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.key.localeCompare(b.key)));
    },
  });
  const rows = useMemo(() => filterHistory(q.data ?? [], f), [q.data, f]);
  if (q.isPending) return <LoadingState onRetry={() => q.refetch()} />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const paged = rows.slice(page * PAGE, page * PAGE + PAGE);
  const set = (patch: Partial<typeof f>) => { setF({ ...f, ...patch }); setPage(0); };

  return (
    <div className="space-y-3">
      <div role="search" aria-label="Filter party history" className="no-print grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Input aria-label="Search history" className="sm:col-span-2" placeholder="LR no., trip, vehicle, driver, route…" value={f.search} onChange={(e) => set({ search: e.target.value })} />
        <select aria-label="Transaction type" className={selectCls} value={f.type} onChange={(e) => set({ type: e.target.value })}>
          <option value="">All transactions</option><option value="lr">LR / Bilty only</option><option value="payment">Payments &amp; receipts only</option>
        </select>
        <Input type="date" aria-label="From date" value={f.from} onChange={(e) => set({ from: e.target.value })} />
        <Input type="date" aria-label="To date" value={f.to} onChange={(e) => set({ to: e.target.value })} />
      </div>
      <div className="no-print flex justify-end">
        <Button variant="outline" size="sm" onClick={() => exportRows(`party-history-${title}`, [
          ["Date", "Type", "Reference / LR", "Trip", "Vehicle", "Driver", "Route", "Amount (INR)", "Amount meaning", "Status"],
          ...rows.map((r) => [formatDate(r.date), r.kind, r.ref, r.tripNo, r.vehicle, r.driver, r.route, money2(r.amount), r.amountLabel, r.status]),
        ])}>Download CSV</Button>
      </div>
      {rows.length === 0 ? (
        <EmptyState title={(q.data?.length ?? 0) ? "No records match these filters" : "No LRs or payments linked to this party yet"} hint={(q.data?.length ?? 0) ? "Clear a filter to see more." : "Records appear here once an LR names this party or a payment/receipt is recorded for it."} />
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <Table>
            <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead>Reference</TableHead><TableHead>Trip</TableHead><TableHead>Vehicle / Driver</TableHead><TableHead>Route</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>{paged.map((r) => (
              <TableRow key={r.key} className={r.status === "Cancelled" || r.status === "Reversed" ? "opacity-60" : ""}>
                <TableCell className="whitespace-nowrap">{formatDate(r.date)}</TableCell>
                <TableCell className="min-w-32 whitespace-normal">{r.kind}</TableCell>
                <TableCell>{r.refLrId ? <Link to="/lr/$id" params={{ id: r.refLrId }} className="text-info hover:underline">{r.ref || "View LR"}</Link> : r.ref || "—"}</TableCell>
                <TableCell>{r.tripId ? <Link to="/trips/$id" params={{ id: r.tripId }} className="text-info hover:underline">{r.tripNo || "View trip"}</Link> : "—"}</TableCell>
                <TableCell className="whitespace-normal">{r.vehicle || "—"}{r.driver ? <span className="block text-xs text-muted-foreground">{r.driver}</span> : null}</TableCell>
                <TableCell className="max-w-48 whitespace-normal">{r.route || "—"}</TableCell>
                <TableCell className="text-right"><Money value={r.amount} /><span className="block text-[10px] text-muted-foreground">{r.amountLabel}</span></TableCell>
                <TableCell><StatusBadge tone={r.status === "Cancelled" || r.status === "Reversed" ? "danger" : "success"}>{r.status}</StatusBadge></TableCell>
              </TableRow>))}</TableBody>
          </Table>
          <div className="flex items-center justify-between border-t px-3 py-2 text-sm text-muted-foreground">
            <span>{rows.length} record(s)</span>
            <div className="flex gap-2"><Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button><Button variant="outline" size="sm" disabled={(page + 1) * PAGE >= rows.length} onClick={() => setPage(page + 1)}>Next</Button></div>
          </div>
        </div>
      )}
      <p className="text-xs text-muted-foreground">This list traces the underlying records. LR freight is the whole LR's freight, not necessarily this party's share, so it is not totalled here. Use the ledger above for the balance.</p>
    </div>
  );
}
