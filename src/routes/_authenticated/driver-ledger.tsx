import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Undo2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Money, StatusBadge, Field } from "@/components/app/ui";
import { LoadingState, ErrorState, EmptyState, errorMessage } from "@/components/app/states";
import { LedgerTable } from "@/components/app/LedgerTable";
import { CommissionPanel } from "@/components/app/CommissionPanel";
import { salaryRecovery } from "@/lib/commission";
import { SearchSelect } from "@/components/app/SearchSelect";
import { selectCls } from "@/components/app/Section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useDrivers, useAccounts, PAY_MODES } from "@/lib/lookups";
import { formatDate, formatINR, todayIST } from "@/lib/format";
import { z } from "zod";

export const Route = createFileRoute("/_authenticated/driver-ledger")({
  validateSearch: z.object({ driver: z.string().optional() }),
  head: () => ({ meta: [{ title: "Driver Ledger — Gokul Cargo Movers" }] }),
  component: DriverLedger,
});

function DriverLedger() {
  const search = Route.useSearch();
  const drivers = useDrivers();
  const [did, setDid] = useState(search.driver ?? "");
  const d = drivers.data?.find((x) => x.id === did);
  return (
    <div className="space-y-4">
      <PageHeader title="Driver Ledger & Salary" description="Advances, salary and payments. 'Receivable' = driver owes Gokul (e.g. unrecovered advance); 'Payable' = Gokul owes the driver." />
      <div className="no-print max-w-md"><Field label="Driver"><SearchSelect value={did} onChange={setDid} options={(drivers.data ?? []).map((x) => ({ value: x.id, label: x.name, hint: x.phone ?? "" }))} placeholder="Choose driver" /></Field></div>
      {!d ? <EmptyState title={(drivers.data?.length ?? 0) ? "Choose a driver" : "No drivers yet"} hint="Add drivers on the Drivers page." /> : (
        <>
          <div className="text-sm text-muted-foreground">Joined {formatDate(d.joining_date)} · Agreed salary {d.salary_amount ? `${formatINR(d.salary_amount)} (${d.salary_frequency})` : "not set"}</div>
          <Salary driver={d} />
          <CommissionPanel driverId={d.id} />
          <h3 className="font-semibold">Ledger</h3>
          <LedgerTable accountType="driver" accountId={d.id} title={`driver-${d.name}`} />
          <Trips driverId={d.id} />
        </>
      )}
    </div>
  );
}

function Trips({ driverId }: { driverId: string }) {
  const q = useQuery({
    queryKey: ["driver-trips", driverId],
    queryFn: async () => {
      const { data, error } = await supabase.from("trips").select("id, trip_number, trip_date, status").eq("driver_id", driverId).order("trip_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  if (!q.data?.length) return null;
  return <div className="text-sm"><h3 className="mb-1 font-semibold">Trip history</h3>{q.data.map((t) => <a key={t.id} href={`/trips/${t.id}`} className="mr-3 text-info hover:underline">{t.trip_number} ({formatDate(t.trip_date)})</a>)}</div>;
}

function Salary({ driver }: { driver: any }) {
  const qc = useQueryClient();
  const accounts = useAccounts();
  const key = ["salary", driver.id];
  const q = useQuery({
    queryKey: key,
    queryFn: async () => {
      const [e, p, a, rec, com] = await Promise.all([
        supabase.from("salary_entries").select("*").eq("driver_id", driver.id).eq("is_cancelled", false).order("period", { ascending: false }),
        supabase.from("salary_payments").select("*").eq("driver_id", driver.id).order("payment_date"),
        supabase.from("advances").select("amount").eq("driver_id", driver.id).eq("recipient_type", "driver").eq("is_cancelled", false),
        supabase.from("salary_payments").select("recovered_advance").eq("driver_id", driver.id).eq("is_reversed", false),
        supabase.from("commission_balances").select("pending_amount").eq("driver_id", driver.id),
      ]);
      for (const r of [e, p, a, rec, com]) if (r.error) throw r.error;
      const advTotal = (a.data ?? []).reduce((s, x) => s + Number(x.amount), 0);
      const recovered = (rec.data ?? []).reduce((s, x) => s + Number(x.recovered_advance), 0);
      return { entries: e.data ?? [], payments: p.data ?? [], unrecovered: Math.max(0, advTotal - recovered), commissionPending: (com.data ?? []).reduce((s, c) => s + Number(c.pending_amount), 0) };
    },
  });
  const [newEntry, setNewEntry] = useState<Record<string, any> | null>(null);
  const [payFor, setPayFor] = useState<Record<string, any> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const inv = () => { qc.invalidateQueries(); };
  const addEntry = useMutation({
    mutationFn: async () => {
      if (!newEntry?.period) throw new Error("Choose the salary month");
      if (!(Number(newEntry.amount) > 0)) throw new Error("Amount must be greater than 0");
      const { error } = await supabase.from("salary_entries").insert({ driver_id: driver.id, period: newEntry.period, due_date: newEntry.due_date || null, amount: Number(newEntry.amount), notes: newEntry.notes || null } as never);
      if (error) throw /duplicate|unique/i.test(error.message) ? new Error("Salary for this month already exists") : error;
    },
    onSuccess: () => { toast.success("Salary month added"); setNewEntry(null); inv(); },
    onError: (e) => setErr(errorMessage(e)),
  });
  const addPay = useMutation({
    mutationFn: async () => {
      if (!payFor) return;
      const amt = Number(payFor.amount || 0); const recov = payFor.useRecovery ? Number(payFor.recovered_advance || 0) : 0;
      const commissionRecovery = payFor.useRecovery ? Number(payFor.recovered_commission || 0) : 0;
      if (amt < 0 || recov < 0 || commissionRecovery < 0 || !Number.isFinite(amt + recov + commissionRecovery)) throw new Error("Amounts must be valid and cannot be negative");
      if (amt <= 0 && recov <= 0 && commissionRecovery <= 0) throw new Error("Enter an amount");
      if (recov > (q.data?.unrecovered ?? 0)) throw new Error("Recovery is more than the unrecovered advance");
      if (commissionRecovery > (q.data?.commissionPending ?? 0)) throw new Error("Recovery exceeds pending commission");
      if (amt + recov + commissionRecovery > payFor.outstanding + 0.004) throw new Error(`This is more than the outstanding salary (${formatINR(payFor.outstanding)})`);
      const { error } = await supabase.from("salary_payments").insert({ driver_id: driver.id, salary_entry_id: payFor.entry_id, payment_date: payFor.payment_date, amount: amt, recovered_advance: recov,
        recovered_commission: commissionRecovery,
        payment_method: payFor.payment_method, account_id: payFor.account_id || null, reference: payFor.reference || null, notes: payFor.notes || null } as never);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Salary payment saved"); setPayFor(null); inv(); },
    onError: (e) => setErr(errorMessage(e)),
  });
  const reverse = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { error } = await supabase.from("salary_payments").update({ is_reversed: true, reversal_reason: reason }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Reversed"); inv(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (q.isPending) return <LoadingState />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const rows = q.data.entries.map((e) => {
    const pays = q.data.payments.filter((p) => p.salary_entry_id === e.id && !p.is_reversed);
    const paid = pays.reduce((s, p) => s + Number(p.amount), 0);
    const rec = pays.reduce((s, p) => s + Number(p.recovered_advance) + Number(p.recovered_commission), 0);
    return { ...e, paid, rec, outstanding: Number(e.amount) - paid - rec };
  });
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div><h3 className="font-semibold">Salary</h3><p className="text-sm">Unrecovered advances: <b><Money value={q.data.unrecovered} /></b> · Total paid: <b><Money value={rows.reduce((s, r) => s + r.paid, 0)} /></b> · Outstanding salary: <b><Money value={rows.reduce((s, r) => s + r.outstanding, 0)} /></b></p></div>
        <Button size="sm" onClick={() => { setErr(null); setNewEntry({ period: todayIST().slice(0, 7), amount: driver.salary_amount ?? "" }); }}><Plus className="mr-1 h-4 w-4" />Add salary month</Button>
      </div>
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">No salary months yet.</p> : (
        <div className="overflow-x-auto"><Table>
          <TableHeader><TableRow><TableHead>Month</TableHead><TableHead>Due</TableHead><TableHead className="text-right">Salary</TableHead><TableHead className="text-right">Paid</TableHead><TableHead className="text-right">Confirmed recoveries</TableHead><TableHead className="text-right">Outstanding</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>{rows.map((r) => (
            <TableRow key={r.id}><TableCell>{r.period}</TableCell><TableCell>{formatDate(r.due_date)}</TableCell><TableCell className="text-right"><Money value={r.amount} /></TableCell>
              <TableCell className="text-right"><Money value={r.paid} /></TableCell><TableCell className="text-right"><Money value={r.rec} /></TableCell>
              <TableCell className="text-right">{r.outstanding > 0.004 ? <StatusBadge tone="warning"><Money value={r.outstanding} /></StatusBadge> : <StatusBadge tone="success">Paid</StatusBadge>}</TableCell>
              <TableCell>{r.outstanding > 0.004 && <Button size="sm" variant="outline" onClick={() => {
                setErr(null);
                const sug = salaryRecovery(r.outstanding, q.data.unrecovered, q.data.commissionPending, true);
                setPayFor({ entry_id: r.id, outstanding: r.outstanding, salary: Number(r.amount), suggested: sug.advance + sug.commission, useRecovery: false, recovered_advance: sug.advance, recovered_commission: sug.commission, amount: r.outstanding, payment_date: todayIST(), payment_method: "cash" });
              }}>Pay</Button>}</TableCell></TableRow>))}</TableBody>
        </Table></div>
      )}
      {q.data.payments.length > 0 && <div className="mt-3 text-xs">
        <p className="mb-1 font-medium">Payment history</p>
        {q.data.payments.map((p) => <p key={p.id} className={p.is_reversed ? "line-through opacity-60" : ""}>{formatDate(p.payment_date)} · {formatINR(p.amount)} paid{Number(p.recovered_advance) > 0 && ` + ${formatINR(p.recovered_advance)} advance recovered`} · {p.payment_method}
          {Number(p.recovered_commission) > 0 && ` + ${formatINR(p.recovered_commission)} commission recovered`}
          {!p.is_reversed && <Button variant="ghost" size="sm" className="ml-2 text-destructive" onClick={() => { const r = window.prompt("Reason for reversing:"); if (r?.trim()) reverse.mutate({ id: p.id, reason: r.trim() }); }}><Undo2 className="inline h-3 w-3" /> reverse</Button>}</p>)}
      </div>}

      <Dialog open={!!newEntry} onOpenChange={(o) => !o && setNewEntry(null)}>
        <DialogContent><DialogHeader><DialogTitle>Add salary month</DialogTitle></DialogHeader>
          {newEntry && <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Month" required><Input type="month" value={newEntry.period} onChange={(e) => setNewEntry({ ...newEntry, period: e.target.value })} /></Field>
            <Field label="Salary amount (₹)" required><Input type="number" min="0" value={newEntry.amount} onChange={(e) => setNewEntry({ ...newEntry, amount: e.target.value })} /></Field>
            <Field label="Due date"><Input type="date" value={newEntry.due_date ?? ""} onChange={(e) => setNewEntry({ ...newEntry, due_date: e.target.value })} /></Field>
            <Field label="Notes"><Input value={newEntry.notes ?? ""} onChange={(e) => setNewEntry({ ...newEntry, notes: e.target.value })} /></Field>
            {err && <p className="rounded bg-destructive/10 p-2 text-sm text-destructive sm:col-span-2">{err}</p>}
          </div>}
          <DialogFooter><Button onClick={() => addEntry.mutate()} disabled={addEntry.isPending}>{addEntry.isPending ? "Saving…" : "Save"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!payFor} onOpenChange={(o) => !o && setPayFor(null)}>
        <DialogContent><DialogHeader><DialogTitle>Pay salary</DialogTitle></DialogHeader>
          {payFor && <div className="grid gap-3 sm:grid-cols-2">
            {payFor.suggested > 0 && <div className="rounded-md border border-info/30 bg-accent p-3 text-sm sm:col-span-2">
              Suggestion: {formatINR(payFor.outstanding)} − {formatINR(payFor.recovered_advance)} advance − {formatINR(payFor.recovered_commission)} commission = <b>{formatINR(payFor.outstanding - Number(payFor.recovered_advance) - Number(payFor.recovered_commission))} payable</b>
              <label className="mt-2 flex items-center gap-2"><input type="checkbox" checked={payFor.useRecovery} onChange={(e) => setPayFor({ ...payFor, useRecovery: e.target.checked, amount: e.target.checked ? payFor.outstanding - Number(payFor.recovered_advance) - Number(payFor.recovered_commission) : payFor.outstanding })} />Yes, recover the advances and commission</label>
            </div>}
            {payFor.useRecovery && <><Field label="Advance to recover (₹)"><Input type="number" min="0" value={payFor.recovered_advance} onChange={(e) => setPayFor({ ...payFor, recovered_advance: e.target.value, amount: payFor.outstanding - Number(e.target.value) - Number(payFor.recovered_commission) })} /></Field><Field label="Commission to recover (₹)"><Input type="number" min="0" value={payFor.recovered_commission} onChange={(e) => setPayFor({ ...payFor, recovered_commission: e.target.value, amount: payFor.outstanding - Number(payFor.recovered_advance) - Number(e.target.value) })} /></Field></>}
            <Field label="Cash/bank amount paid now (₹)" hint="Partial payments allowed"><Input type="number" min="0" value={payFor.amount} onChange={(e) => setPayFor({ ...payFor, amount: e.target.value })} /></Field>
            <Field label="Date"><Input type="date" value={payFor.payment_date} onChange={(e) => setPayFor({ ...payFor, payment_date: e.target.value })} /></Field>
            <Field label="Method"><select className={selectCls} value={payFor.payment_method} onChange={(e) => setPayFor({ ...payFor, payment_method: e.target.value })}>{PAY_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</select></Field>
            <Field label="Cash / bank account"><select className={selectCls} value={payFor.account_id ?? ""} onChange={(e) => setPayFor({ ...payFor, account_id: e.target.value })}><option value="">—</option>{accounts.data?.filter((a) => a.is_active).map((a) => <option key={a.id} value={a.id}>{a.display_name}</option>)}</select></Field>
            <Field label="Reference"><Input value={payFor.reference ?? ""} onChange={(e) => setPayFor({ ...payFor, reference: e.target.value })} /></Field>
            {err && <p className="rounded bg-destructive/10 p-2 text-sm text-destructive sm:col-span-2">{err}</p>}
          </div>}
          <DialogFooter><Button onClick={() => addPay.mutate()} disabled={addPay.isPending}>{addPay.isPending ? "Saving…" : "Save payment"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
