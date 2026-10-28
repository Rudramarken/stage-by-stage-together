import { PaymentsList } from "@/components/app/PaymentsList";
import { RowActions, actionCell } from "@/components/app/RowActions";
import { Eye } from "lucide-react";
import { pageHead } from "@/lib/page-head";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Money, StatusBadge, Field } from "@/components/app/ui";
import { LoadingState, ErrorState, EmptyState } from "@/components/app/states";
import { LedgerTable } from "@/components/app/LedgerTable";
import { PeriodPicker, usePeriod } from "@/components/app/PeriodPicker";
import { PaymentDialog } from "@/components/app/PaymentDialog";
import { SearchSelect } from "@/components/app/SearchSelect";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useTransporters } from "@/lib/lookups";
import { formatDate } from "@/lib/format";
import { useBusiness } from "@/lib/business";
import { OpeningBalanceDialog, ManualEntryDialog, ManualEntriesList } from "@/components/app/TransporterLedgerTools";
import { summarizeTransporterLines, remainingLabel, type LedgerLine, type TransporterSummary } from "@/lib/transporter-ledger";
import { fetchAllRows } from "@/lib/accounts";

export const Route = createFileRoute("/_authenticated/transporter-settlements")({
  head: () => pageHead("Transporter Settlements — Gokul Cargo Movers", "Transporter Settlements records for Gokul Cargo Movers transport management."),
  component: () => <SettlementsPanel />,
});

function statusOf(payable: number, settled: number) {
  const rem = payable - settled;
  if (payable <= 0) return { label: "No freight", tone: "muted" };
  if (rem <= 0.004) return { label: "Paid", tone: "success" };
  if (settled > 0) return { label: "Partially Paid", tone: "warning" };
  return { label: "Unpaid", tone: "danger" };
}

/**
 * Transporter ledger, opening balance, manual entries, payments and freight settlement.
 * It has no sidebar entry of its own any more: it lives in Party Ledger -> "Transporter" tab (embedded) and still opens at /transporter-settlements.
 */
export function SettlementsPanel({ embedded = false }: { embedded?: boolean }) {
  const transporters = useTransporters();
  const [tid, setTid] = useState("");
  const [pay, setPay] = useState(false);
  const { role } = useBusiness();
  const canEdit = role === "owner" || role === "admin";
  const [openingDlg, setOpeningDlg] = useState(false);
  const [manualDlg, setManualDlg] = useState(false);
  const { sel, setSel, period } = usePeriod();
  const from = period.from ?? "";
  const to = period.to ?? "";
  const bal = useQuery({
    queryKey: ["settlements", "balances"],
    queryFn: async () => {
      const data = await fetchAllRows((from, to) => supabase.from("ledger_entries").select("account_id, debit, credit, line_kind").eq("account_type", "transporter").order("id").range(from, to));
      const lines = new Map<string, LedgerLine[]>();
      for (const r of data) { const a = lines.get(r.account_id) ?? []; a.push(r); lines.set(r.account_id, a); }
      const m = new Map<string, TransporterSummary>();
      for (const [id, l] of lines) m.set(id, summarizeTransporterLines(l));
      return m;
    },
  });
  const com = useQuery({
    queryKey: ["settlements", "commission", tid],
    enabled: !!tid,
    queryFn: async () => {
      const { data, error } = await supabase.from("commission_balances").select("amount, received_amount, pending_amount, is_cancelled").eq("transporter_id", tid);
      if (error) throw error;
      const live = (data as any[]).filter((c) => !c.is_cancelled);
      const sum = (k: string) => live.reduce((s, c) => s + Number(c[k] ?? 0), 0);
      return { earned: sum("amount"), received: sum("received_amount"), pending: sum("pending_amount") };
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
  const tb = bal.data?.get(tid) ?? EMPTY;
  return (
    <div className="space-y-4">
      {embedded
        ? (tid ? <div className="no-print flex flex-wrap justify-end gap-2"><Button variant="outline" onClick={() => window.print()}>Print statement</Button><Button onClick={() => setPay(true)}><Plus className="mr-1 h-4 w-4" />Record payment</Button></div> : <p className="text-sm text-muted-foreground">Freight payable vs. advances and payments, per transporter (including names typed on trips/LRs). Choose a transporter to open its ledger.</p>)
        : <PageHeader title="Transporter Settlements" description="Freight payable vs. advances and payments, per transporter (including names typed on trips/LRs)."
            actions={tid ? <><Button variant="outline" onClick={() => window.print()}>Print statement</Button><Button onClick={() => setPay(true)}><Plus className="mr-1 h-4 w-4" />Record payment</Button></> : undefined} />}
      <div className="no-print max-w-md"><Field label="Transporter"><SearchSelect value={tid} onChange={setTid} options={(transporters.data ?? []).map((x) => ({ value: x.id, label: x.name }))} placeholder="Choose transporter" /></Field></div>
      {!tid ? (
        bal.isPending || transporters.isPending ? <LoadingState /> : bal.isError ? <ErrorState error={bal.error} onRetry={() => bal.refetch()} /> :
          (transporters.data ?? []).length === 0 ? <EmptyState title="No transporters yet" hint="They are added when you type one on a trip or LR." /> : (
            <div className="overflow-x-auto rounded-lg border bg-card"><Table>
              <TableHeader><TableRow><TableHead>Transporter</TableHead><TableHead className="text-right">Payable (opening + freight + adjustments)</TableHead><TableHead className="text-right">Advances + payments + direct</TableHead><TableHead className="text-right">Remaining</TableHead><TableHead className="text-right">Commission to receive</TableHead><TableHead>Status</TableHead><TableHead className={actionCell}>Actions</TableHead></TableRow></TableHeader>
              <TableBody>{(transporters.data ?? []).map((x) => { const b = bal.data?.get(x.id) ?? EMPTY; const s = statusOf(b.opening + b.freight + b.adjustments, b.paid); return (
                <TableRow key={x.id} className="cursor-pointer" onClick={() => setTid(x.id)}>
                  <TableCell className="font-medium text-info">{x.name}</TableCell><TableCell className="text-right"><Money value={b.opening + b.freight + b.adjustments} /></TableCell>
                  <TableCell className="text-right"><Money value={b.paid} /></TableCell><TableCell className="text-right font-semibold"><Money value={b.remaining} /></TableCell><TableCell className="text-right font-semibold text-success"><Money value={b.commissionDue} /></TableCell>
                  <TableCell><StatusBadge tone={s.tone}>{s.label}</StatusBadge></TableCell><TableCell className={actionCell}><RowActions label={x.name} actions={[{ label: "View", icon: Eye, onClick: () => setTid(x.id) }]} /></TableCell></TableRow>); })}</TableBody>
            </Table></div>)
      ) : (
        <>
          <h2 className="text-xl font-semibold">{t?.name}</h2>
          {bal.isError && <ErrorState error={bal.error} onRetry={() => bal.refetch()} />}
          <div className="no-print flex flex-wrap gap-2">
            {canEdit && <Button variant="outline" onClick={() => setOpeningDlg(true)}>Opening balance</Button>}
            {canEdit && <Button variant="outline" onClick={() => setManualDlg(true)}>Add ledger entry</Button>}
          </div>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Box k={`Opening balance${t?.opening_date ? " (" + formatDate(t.opening_date) + ")" : ""}`} v={tb.opening} note={tb.opening > 0 ? "Payable" : tb.opening < 0 ? "Receivable" : undefined} />
            <Box k="Freight payable (LRs)" v={tb.freight} />
            <Box k="Manual adjustments (+ payable / - payable)" v={tb.adjustments} />
            <Box k="Advances, payments & direct" v={tb.paid} />
            <Box k="Remaining" v={tb.remaining} tone="warning" note={remainingLabel(tb.remaining).text.replace(/^₹[\d,.]+ /, "")} />
            <div className="rounded-lg border bg-card p-3"><p className="text-xs text-muted-foreground">Status</p><StatusBadge tone={statusOf(tb.opening + tb.freight + tb.adjustments, tb.paid).tone}>{statusOf(tb.opening + tb.freight + tb.adjustments, tb.paid).label}</StatusBadge></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Box k="Commission earned" v={com.data?.earned ?? 0} />
            <Box k="Commission received" v={com.data?.received ?? 0} />
            <Box k="Commission pending (from transporter)" v={com.data?.pending ?? 0} />
          </div>
          {com.isError && <ErrorState error={com.error} onRetry={() => com.refetch()} />}
          <p className="text-xs text-muted-foreground">Commission is tracked separately and is never added to the freight payable. Record commission receipts on the Commission screen.</p>
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
          <PaymentsList transporterId={tid} />
          <h3 className="font-semibold">Transporter ledger</h3>
          <p className="text-xs text-muted-foreground">Balance = debit - credit. "Payable" = Gokul still owes this transporter; "Receivable" = the transporter owes Gokul (advance paid beyond freight, or commission). The opening balance is one row and is never income or expense. Each advance and payment appears once. Commission shows as a debit - the amount Gokul has to receive from this transporter.</p>
          <PeriodPicker sel={sel} onChange={setSel} period={period} idPrefix="transporter-period" />
          <LedgerTable accountType="transporter" accountId={tid} from={from || undefined} to={to || undefined} title={`transporter-${t?.name}`} accountName={t?.name} />
          <h3 className="font-semibold">Manual ledger entries</h3>
          <ManualEntriesList transporterId={tid} canEdit={canEdit} onSaved={() => setSel({ ...sel, mode: "all" })} />
          {t && <OpeningBalanceDialog open={openingDlg} onOpenChange={setOpeningDlg} transporter={t} />}
          <ManualEntryDialog open={manualDlg} onOpenChange={setManualDlg} transporterId={tid} onSaved={() => setSel({ ...sel, mode: "all" })} />
          <PaymentDialog open={pay} onOpenChange={setPay} initial={pay ? { payment_type: "transporter_payment", transporter_id: tid, payment_date: new Date().toISOString().slice(0, 10), mode: "cash", account_id: "" } : null} />
        </>
      )}
    </div>
  );
}

const EMPTY: TransporterSummary = { opening: 0, freight: 0, adjustments: 0, paid: 0, commissionDue: 0, remaining: 0 };

function Box({ k, v, tone, note }: { k: string; v: number; tone?: string; note?: string }) {
  return <div className="rounded-lg border bg-card p-3"><p className="text-xs text-muted-foreground">{k}</p><p className={`text-lg font-semibold ${tone === "warning" ? "text-warning-foreground" : ""}`}><Money value={v} /></p>{note && <p className="text-xs text-muted-foreground">{note}</p>}</div>;
}
