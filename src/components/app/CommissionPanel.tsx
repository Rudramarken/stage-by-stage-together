import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAccounts, useDrivers, nameOf } from "@/lib/lookups";
import { formatDate, todayIST } from "@/lib/format";
import { validateCommissionReceipt } from "@/lib/commission";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Field, Money } from "./ui";
import { selectCls } from "./Section";
import { ErrorState, LoadingState, errorMessage } from "./states";

export function CommissionPanel({ lrId, tripId, driverId }: { lrId?: string; tripId?: string; driverId?: string }) {
  const qc = useQueryClient();
  const accounts = useAccounts(); const drivers = useDrivers();
  const [form, setForm] = useState<{ commission_id: string; pending: number; amount: string; receipt_date: string; account_id: string; reference: string; notes: string; request_id: string } | null>(null);
  const q = useQuery({
    queryKey: ["commissions", lrId, tripId, driverId],
    queryFn: async () => {
      let query = supabase.from("commission_balances").select("*");
      if (lrId) query = query.eq("lr_id", lrId);
      if (tripId) query = query.eq("trip_id", tripId);
      if (driverId) query = query.eq("driver_id", driverId);
      const { data, error } = await query.order("commission_date");
      if (error) throw error;
      const ids = (data ?? []).flatMap((c) => c.id ? [c.id] : []);
      const receipts = ids.length ? await supabase.from("commission_receipts").select("*").in("commission_id", ids).order("receipt_date") : { data: [], error: null };
      if (receipts.error) throw receipts.error;
      return { commissions: data ?? [], receipts: receipts.data ?? [] };
    },
  });
  const invalidate = () => { qc.invalidateQueries(); };
  const save = useMutation({
    mutationFn: async () => {
      if (!form || !validateCommissionReceipt(Number(form.amount), form.pending)) throw new Error("Amount must be greater than zero and no more than pending commission");
      if (!form.account_id) throw new Error("Choose Cash or a bank account");
      const { error } = await supabase.rpc("record_commission_receipt", { p: form });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Commission receipt saved"); setForm(null); invalidate(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const reverse = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { error } = await supabase.rpc("reverse_commission_receipt", { p_id: id, p_reason: reason });
      if (error) throw error;
    }, onSuccess: invalidate, onError: (e) => toast.error(errorMessage(e)),
  });
  if (q.isPending) return <LoadingState />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  return <section className="space-y-3 text-sm">
    <h3 className="font-semibold">Driver commission & receipt history</h3>
    {!q.data.commissions.length && <p className="text-muted-foreground">Commission off — nothing due.</p>}
    {q.data.commissions.map((c) => <div key={c.id} className="border-b pb-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">{c.lr_id ? <Link to="/lr/$id" params={{ id: c.lr_id }} className="text-info">{c.document_number}</Link> : c.trip_id ? <Link to="/trips/$id" params={{ id: c.trip_id }} className="text-info">{c.document_number}</Link> : c.document_number} · {nameOf(drivers.data, c.driver_id)} {c.is_cancelled && `· Cancelled: ${c.cancel_reason}`}</p>
        {c.id && Number(c.pending_amount) > 0 && <Button size="sm" variant="outline" onClick={() => setForm({ commission_id: c.id ?? "", pending: Number(c.pending_amount), amount: String(c.pending_amount), receipt_date: todayIST(), account_id: accounts.data?.find((a) => a.kind === "cash" && a.is_active)?.id ?? "", reference: "", notes: "", request_id: crypto.randomUUID() })}>Record commission received</Button>}
      </div>
      <div className="mt-2 flex flex-wrap gap-4"><p>Commission due from driver: <Money value={c.is_cancelled ? 0 : c.amount} /></p><p className="text-success">Commission received: <Money value={c.received_amount} /></p><p className="text-warning-foreground">Commission pending: <Money value={c.pending_amount} /></p></div>
      {q.data.receipts.filter((r) => r.commission_id === c.id).map((r) => <div key={r.id} className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        <span className={r.is_reversed ? "line-through text-muted-foreground" : ""}>{formatDate(r.receipt_date)} · <Money value={r.amount} /> · {r.salary_payment_id ? "Salary recovery" : nameOf(accounts.data, r.account_id, "display_name")} · {r.reference} {r.notes} {r.is_reversed && `· Reversed: ${r.reversal_reason}`}</span>
        {!r.is_reversed && !r.salary_payment_id && <Button size="sm" variant="ghost" className="text-destructive" disabled={reverse.isPending} onClick={() => { const reason = window.prompt("Reason for reversing commission receipt:"); if (reason?.trim()) reverse.mutate({ id: r.id, reason: reason.trim() }); }}>Reverse</Button>}
      </div>)}
    </div>)}
    <Dialog open={!!form} onOpenChange={(open) => { if (!open) setForm(null); }}><DialogContent><DialogHeader><DialogTitle>Record commission received from driver</DialogTitle></DialogHeader>
      {form && <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Amount received (₹)" required><Input aria-label="Amount received" type="number" min="0.01" step="0.01" max={form.pending} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field>
        <Field label="Date"><Input type="date" value={form.receipt_date} onChange={(e) => setForm({ ...form, receipt_date: e.target.value })} /></Field>
        <Field label="Received into" required><select aria-label="Received into" className={selectCls} value={form.account_id} onChange={(e) => setForm({ ...form, account_id: e.target.value })}><option value="">Choose account</option>{accounts.data?.filter((a) => a.is_active).map((a) => <option key={a.id} value={a.id}>{a.display_name}</option>)}</select></Field>
        <Field label="Reference"><Input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} /></Field>
        <Field label="Notes"><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
      </div>}
      <DialogFooter><Button disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? "Saving…" : "Save commission receipt"}</Button></DialogFooter>
    </DialogContent></Dialog>
  </section>;
}