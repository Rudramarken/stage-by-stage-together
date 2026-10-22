import { pageHead } from "@/lib/page-head";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Money, StatusBadge, Field } from "@/components/app/ui";
import { LoadingState, ErrorState, EmptyState } from "@/components/app/states";
import { LedgerTable } from "@/components/app/LedgerTable";
import { PaymentDialog } from "@/components/app/PaymentDialog";
import { SearchSelect } from "@/components/app/SearchSelect";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useTransporters } from "@/lib/lookups";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/transporter-settlements")({
  head: () => pageHead("Transporter Settlements — Gokul Cargo Movers", "Transporter Settlements records for Gokul Cargo Movers transport management."),
  component: Settlements,
});

function statusOf(payable: number, settled: number) {
  const rem = payable - settled;
  if (payable <= 0) return { label: "No freight", tone: "muted" };
  if (rem <= 0.004) return { label: "Paid", tone: "success" };
  if (settled > 0) return { label: "Partially Paid", tone: "warning" };
  return { label: "Unpaid", tone: "danger" };
}

function Settlements() {
  const transporters = useTransporters();
  const [tid, setTid] = useState("");
  const [pay, setPay] = useState(false);
  const bal = useQuery({
    queryKey: ["settlements", "balances"],
    queryFn: async () => {
      const { data, error } = await supabase.from("ledger_entries").select("account_id, debit, credit").eq("account_type", "transporter");
      if (error) throw error;
      const m = new Map<string, { payable: number; settled: number }>();
      for (const r of data) {
        const x = m.get(r.account_id) ?? { payable: 0, settled: 0 };
        x.payable += Number(r.credit); x.settled += Number(r.debit); m.set(r.account_id, x);
      }
      return m;
    },
  });
  const detail = useQuery({
    queryKey: ["settlements", tid],
    enabled: !!tid,
    queryFn: async () => {
      const { data, error } = await supabase.from("lrs").select("id, lr_number, lr_date, trip_id, trips(trip_number), vehicle_number, freight_payable, direct_payment_enabled, direct_payment_amount, final_freight, status, payment_allocations(amount, target, payments(is_reversed))").eq("transporter_id", tid).order("lr_date");
      if (error) throw error;
      return data as any[];
    },
  });
  const t = transporters.data?.find((x) => x.id === tid);
  const tb = bal.data?.get(tid) ?? { payable: 0, settled: 0 };
  return (
    <div className="space-y-4">
      <PageHeader title="Transporter Settlements" description="Freight payable vs. advances and payments, per transporter (including names typed on trips/LRs)."
        actions={tid ? <><Button variant="outline" onClick={() => window.print()}>Print statement</Button><Button onClick={() => setPay(true)}><Plus className="mr-1 h-4 w-4" />Record payment</Button></> : undefined} />
      <div className="no-print max-w-md"><Field label="Transporter"><SearchSelect value={tid} onChange={setTid} options={(transporters.data ?? []).map((x) => ({ value: x.id, label: x.name }))} placeholder="Choose transporter" /></Field></div>
      {!tid ? (
        bal.isPending || transporters.isPending ? <LoadingState /> : bal.isError ? <ErrorState error={bal.error} onRetry={() => bal.refetch()} /> :
          (transporters.data ?? []).length === 0 ? <EmptyState title="No transporters yet" hint="They are added when you type one on a trip or LR." /> : (
            <div className="overflow-x-auto rounded-lg border bg-card"><Table>
              <TableHeader><TableRow><TableHead>Transporter</TableHead><TableHead className="text-right">Freight payable</TableHead><TableHead className="text-right">Advances + payments + direct</TableHead><TableHead className="text-right">Remaining</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
              <TableBody>{transporters.data!.map((x) => { const b = bal.data!.get(x.id) ?? { payable: 0, settled: 0 }; const s = statusOf(b.payable, b.settled); return (
                <TableRow key={x.id} className="cursor-pointer" onClick={() => setTid(x.id)}>
                  <TableCell className="font-medium text-info">{x.name}</TableCell><TableCell className="text-right"><Money value={b.payable} /></TableCell>
                  <TableCell className="text-right"><Money value={b.settled} /></TableCell><TableCell className="text-right font-semibold"><Money value={b.payable - b.settled} /></TableCell>
                  <TableCell><StatusBadge tone={s.tone}>{s.label}</StatusBadge></TableCell></TableRow>); })}</TableBody>
            </Table></div>)
      ) : (
        <>
          <h2 className="text-xl font-semibold">{t?.name}</h2>
          <div className="grid gap-3 sm:grid-cols-4">
            <Box k="Freight payable (total)" v={tb.payable} />
            <Box k="Advances, payments & direct" v={tb.settled} />
            <Box k="Remaining" v={tb.payable - tb.settled} tone="warning" />
            <div className="rounded-lg border bg-card p-3"><p className="text-xs text-muted-foreground">Status</p><StatusBadge tone={statusOf(tb.payable, tb.settled).tone}>{statusOf(tb.payable, tb.settled).label}</StatusBadge></div>
          </div>
          {detail.isPending ? <LoadingState /> : detail.isError ? <ErrorState error={detail.error} onRetry={() => detail.refetch()} /> : (
            <div className="overflow-x-auto rounded-lg border bg-card"><Table>
              <TableHeader><TableRow><TableHead>LR</TableHead><TableHead>Date</TableHead><TableHead>Trip</TableHead><TableHead>Vehicle</TableHead><TableHead className="text-right">Freight payable</TableHead><TableHead className="text-right">Paid directly by consignee</TableHead><TableHead className="text-right">Payments allocated</TableHead></TableRow></TableHeader>
              <TableBody>{detail.data.filter((l) => l.status === "active").map((l) => {
                const alloc = l.payment_allocations.filter((a: any) => a.target === "payable" && !a.payments?.is_reversed).reduce((s: number, a: any) => s + Number(a.amount), 0);
                return (<TableRow key={l.id}><TableCell><Link to="/lr/$id" params={{ id: l.id }} className="text-info hover:underline">{l.lr_number}</Link></TableCell><TableCell>{formatDate(l.lr_date)}</TableCell>
                  <TableCell>{l.trip_id ? <Link to="/trips/$id" params={{ id: l.trip_id }} className="hover:underline">{l.trips?.trip_number}</Link> : "—"}</TableCell><TableCell>{l.vehicle_number ?? "—"}</TableCell>
                  <TableCell className="text-right"><Money value={l.freight_payable} /></TableCell>
                  <TableCell className="text-right"><Money value={l.direct_payment_enabled ? Math.min(Number(l.direct_payment_amount), Number(l.freight_payable)) : 0} /></TableCell>
                  <TableCell className="text-right"><Money value={alloc} /></TableCell></TableRow>);
              })}</TableBody>
              <TableFooter><TableRow><TableCell colSpan={4}>Total</TableCell><TableCell className="text-right"><Money value={detail.data.filter((l) => l.status === "active").reduce((s, l) => s + Number(l.freight_payable), 0)} /></TableCell><TableCell colSpan={2} /></TableRow></TableFooter>
            </Table></div>
          )}
          <h3 className="font-semibold">Transporter ledger</h3>
          <p className="text-xs text-muted-foreground">Here "Payable" = Gokul still owes this transporter. Each advance and payment appears once.</p>
          <LedgerTable accountType="transporter" accountId={tid} title={`transporter-${t?.name}`} />
          <PaymentDialog open={pay} onOpenChange={setPay} initial={pay ? { payment_type: "transporter_payment", transporter_id: tid, payment_date: new Date().toISOString().slice(0, 10), mode: "cash", account_id: "" } : null} />
        </>
      )}
    </div>
  );
}

function Box({ k, v, tone }: { k: string; v: number; tone?: string }) {
  return <div className="rounded-lg border bg-card p-3"><p className="text-xs text-muted-foreground">{k}</p><p className={`text-lg font-semibold ${tone === "warning" ? "text-warning-foreground" : ""}`}><Money value={v} /></p></div>;
}
