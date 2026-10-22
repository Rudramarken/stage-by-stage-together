import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Money, StatusBadge } from "@/components/app/ui";
import { LoadingState, ErrorState } from "@/components/app/states";
import { Input } from "@/components/ui/input";
import { selectCls } from "@/components/app/Section";
import { TRIP_STATUS, PAYMENT_TYPE, useParties, useTransporters, nameOf } from "@/lib/lookups";
import { formatDate, todayIST } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Gokul Cargo Movers" }] }),
  component: Dashboard,
});

function rangeFor(kind: string, cf: string, ct: string): [string, string] {
  const t = todayIST();
  const d = new Date(t + "T00:00:00");
  const iso = (x: Date) => x.toISOString().slice(0, 10);
  if (kind === "today") return [t, t];
  if (kind === "week") { const s = new Date(d); s.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return [iso(s), t]; }
  if (kind === "month") return [t.slice(0, 8) + "01", t];
  return [cf || "1900-01-01", ct || "2999-12-31"];
}

function Dashboard() {
  const [kind, setKind] = useState("month");
  const [cf, setCf] = useState(""); const [ct, setCt] = useState("");
  const [from, to] = rangeFor(kind, cf, ct);
  const parties = useParties(); const transporters = useTransporters();
  const q = useQuery({
    queryKey: ["dashboard", from, to],
    queryFn: async () => {
      const [trips, lrs, pays, exps, bal, com, receipts] = await Promise.all([
        supabase.from("trips").select("id, trip_number, trip_date, status, trip_stops(location, seq)").gte("trip_date", from).lte("trip_date", to).order("trip_date", { ascending: false }),
        supabase.from("lrs").select("final_freight").eq("status", "active").gte("lr_date", from).lte("lr_date", to),
        supabase.from("payments").select("*").eq("is_reversed", false).gte("payment_date", from).lte("payment_date", to).order("payment_date", { ascending: false }),
        supabase.from("expenses").select("amount").eq("is_cancelled", false).eq("scope", "trip").gte("expense_date", from).lte("expense_date", to),
        supabase.from("account_balances").select("account_type, balance"),
        supabase.from("commission_balances").select("pending_amount"),
        supabase.from("commission_receipts").select("amount, salary_payment_id").eq("is_reversed", false).gte("receipt_date", from).lte("receipt_date", to),
      ]);
      for (const r of [trips, lrs, pays, exps, bal, com, receipts]) if (r.error) throw r.error;
      const isIn = (t: string) => ["customer_receipt", "third_party_receipt", "advance_received"].includes(t);
      const b = bal.data!.map((x) => ({ ...x, balance: Number(x.balance) }));
      return {
        trips: trips.data!,
        freight: lrs.data!.reduce((s, l) => s + Number(l.final_freight), 0),
        receipts: (pays.data ?? []).filter((p) => isIn(p.payment_type)).reduce((s, p) => s + Number(p.amount), 0) + (receipts.data ?? []).filter((r) => !r.salary_payment_id).reduce((s, r) => s + Number(r.amount), 0),
        expenses: exps.data!.reduce((s, e) => s + Number(e.amount), 0),
        receivable: b.filter((x) => x.account_type === "party" && x.balance > 0).reduce((s, x) => s + x.balance, 0),
        transporterPayable: b.filter((x) => x.account_type === "transporter" && x.balance < 0).reduce((s, x) => s - x.balance, 0),
        commission: (com.data ?? []).reduce((s, c) => s + Number(c.pending_amount), 0),
        commissionReceived: (receipts.data ?? []).reduce((s, r) => s + Number(r.amount), 0),
        payments: pays.data!.slice(0, 8),
      };
    },
  });
  return (
    <div>
      <PageHeader title="Dashboard" description="Live figures from your records only."
        actions={<div className="flex flex-wrap gap-2">
          <select className={selectCls + " w-36"} value={kind} onChange={(e) => setKind(e.target.value)}><option value="today">Today</option><option value="week">This week</option><option value="month">This month</option><option value="custom">Custom</option></select>
          {kind === "custom" && <><Input type="date" className="w-40" value={cf} onChange={(e) => setCf(e.target.value)} /><Input type="date" className="w-40" value={ct} onChange={(e) => setCt(e.target.value)} /></>}
        </div>} />
      {q.isPending ? <LoadingState /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat k="Trips in period" v={String(q.data.trips.length)} sub={Object.entries(TRIP_STATUS).map(([k, s]) => { const n = q.data.trips.filter((t) => t.status === k).length; return n ? `${s.label} ${n}` : ""; }).filter(Boolean).join(" · ")} />
            <Stat k="Freight billed (period)" m={q.data.freight} />
            <Stat k="Receipts received (period)" m={q.data.receipts} tone="success" />
            <Stat k="Trip expenses incurred (period)" m={q.data.expenses} />
            <Stat k="Outstanding receivable (now)" m={q.data.receivable} tone="success" />
            <Stat k="Transporter payable (now)" m={q.data.transporterPayable} tone="warning" />
            <Stat k="Pending commission (not income)" m={q.data.commission} tone="warning" />
            <Stat k="Commission received (period)" m={q.data.commissionReceived} tone="success" />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border bg-card p-4"><div className="mb-2 flex justify-between"><h3 className="font-semibold">Recent trips</h3><Link to="/trips" className="text-sm text-info">All</Link></div>
              {q.data.trips.length === 0 ? <p className="text-sm text-muted-foreground">No trips in this period. <Link to="/trips/new" className="text-info underline">Create a trip</Link></p> :
                q.data.trips.slice(0, 8).map((t) => <Link key={t.id} to="/trips/$id" params={{ id: t.id }} className="flex items-center justify-between border-b py-2 text-sm last:border-0 hover:bg-muted/50">
                  <span><b>{t.trip_number}</b> · {formatDate(t.trip_date)} · {[...t.trip_stops].sort((a, b) => a.seq - b.seq).map((s) => s.location).join(" → ")}</span><StatusBadge tone={TRIP_STATUS[t.status]?.tone}>{TRIP_STATUS[t.status]?.label}</StatusBadge></Link>)}
            </div>
            <div className="rounded-lg border bg-card p-4"><div className="mb-2 flex justify-between"><h3 className="font-semibold">Recent payments</h3><Link to="/payments" className="text-sm text-info">All</Link></div>
              {q.data.payments.length === 0 ? <p className="text-sm text-muted-foreground">No payments in this period.</p> :
                q.data.payments.map((p) => <div key={p.id} className="flex justify-between border-b py-2 text-sm last:border-0"><span>{formatDate(p.payment_date)} · {PAYMENT_TYPE[p.payment_type]} · {nameOf(transporters.data, p.transporter_id) || nameOf(parties.data, p.party_id)}</span><Money value={p.amount} /></div>)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ k, v, m, sub, tone }: { k: string; v?: string; m?: number; sub?: string; tone?: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs text-muted-foreground">{k}</p>
      <p className={`mt-1 text-2xl font-semibold ${tone === "success" ? "text-success" : tone === "warning" ? "text-warning-foreground" : "text-primary"}`}>{m != null ? <Money value={m} /> : v}</p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}
