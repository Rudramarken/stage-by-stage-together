import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Field, Money, StatusBadge } from "./ui";
import { selectCls } from "./Section";
import { ErrorState, LoadingState, errorMessage } from "./states";
import { formatDate, todayIST } from "@/lib/format";
import { fetchAllRows } from "@/lib/accounts";

const refreshAll = (qc: ReturnType<typeof useQueryClient>) => qc.invalidateQueries();

/** Opening balance: one record per transporter, edited in place (the ledger row is updated, never duplicated). */
export function OpeningBalanceDialog({ open, onOpenChange, transporter }: { open: boolean; onOpenChange: (o: boolean) => void; transporter: any }) {
  const qc = useQueryClient();
  const [type, setType] = useState("none");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!open || !transporter) return;
    setErr(null);
    setType(transporter.opening_type ?? "none");
    setAmount(Number(transporter.opening_balance) > 0 ? String(transporter.opening_balance) : "");
    setDate(transporter.opening_date ?? "");
  }, [open, transporter]);
  const save = useMutation({
    mutationFn: async () => {
      if (type !== "none") {
        if (!(Number(amount) > 0)) throw new Error("Enter an opening balance greater than 0, or choose None");
        if (!date) throw new Error("Opening balance date is required");
      }
      const { error } = await supabase.rpc("set_transporter_opening" as any, { p_transporter_id: transporter.id, p_type: type, p_amount: type === "none" ? 0 : Number(amount), p_date: type === "none" ? null : date } as any);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Opening balance saved"); refreshAll(qc); onOpenChange(false); },
    onError: (e) => setErr(errorMessage(e)),
  });
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!save.isPending) onOpenChange(o); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Opening balance — {transporter?.name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Field label="Type" hint="Old balance from before using this app. Never counted as income or expense.">
            <select className={selectCls} value={type} onChange={(e) => setType(e.target.value)}>
              <option value="none">None</option>
              <option value="payable">Payable — Gokul owes this transporter</option>
              <option value="receivable">Receivable — this transporter owes Gokul</option>
            </select>
          </Field>
          {type !== "none" && <>
            <Field label="Amount (₹)" required><Input type="number" inputMode="decimal" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
            <Field label="Opening balance date" required><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          </>}
          <p className="text-xs text-muted-foreground">If this transporter is also a Party with an opening balance, enter the old balance in only one place, otherwise the two ledgers will both show it.</p>
          {err && <p className="text-sm text-destructive" role="alert">{err}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={save.isPending} onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={save.isPending} onClick={() => { setErr(null); save.mutate(); }}>{save.isPending ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Manual adjustment. The id is created once per form so a retry or an edit updates the same row. */
export function ManualEntryDialog({ open, onOpenChange, transporterId, entry, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; transporterId: string; entry?: any | null; onSaved?: () => void }) {
  const qc = useQueryClient();
  const busy = useRef(false);
  const [id, setId] = useState("");
  const [date, setDate] = useState(todayIST());
  const [direction, setDirection] = useState("increase_payable");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!open || busy.current) return;
    setErr(null);
    setId(entry?.id ?? crypto.randomUUID());
    setDate(entry?.entry_date ?? todayIST()); setDirection(entry?.direction ?? "increase_payable");
    setAmount(entry ? String(entry.amount) : ""); setReference(entry?.reference ?? ""); setNotes(entry?.notes ?? "");
  }, [open, entry, transporterId]);
  const save = useMutation({
    mutationFn: async () => {
      if (!id) throw new Error("Reopen the entry form before saving");
      if (!date) throw new Error("Date is required");
      if (!(Number(amount) > 0)) throw new Error("Amount must be greater than 0");
      if (notes.trim().length < 3) throw new Error("Notes are required");
      const { error } = await supabase.rpc("save_transporter_manual_entry" as any, { p_id: id, p_transporter_id: transporterId, p_date: date, p_direction: direction, p_amount: Number(amount), p_reference: reference || null, p_notes: notes } as any);
      if (error) throw error;
    },
    onSuccess: async () => { await refreshAll(qc); onSaved?.(); toast.success(entry ? "Entry updated" : "Entry added"); onOpenChange(false); },
    onError: (e) => setErr(errorMessage(e)),
    onSettled: () => { busy.current = false; },
  });
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy.current) onOpenChange(o); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{entry ? "Edit manual entry" : "Add ledger entry"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="rounded-md border bg-card p-2 text-xs text-muted-foreground">For adjustments only. Do <b>not</b> use this for freight, payments, advances or commission — they are posted automatically from LRs, Payments and Commission.</p>
          <Field label="Date" required><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Effect on the balance" required>
            <select className={selectCls} value={direction} onChange={(e) => setDirection(e.target.value)}>
              <option value="increase_payable">Increase payable (Gokul owes more) — credit</option>
              <option value="reduce_payable">Reduce payable (Gokul owes less) — debit</option>
            </select>
          </Field>
          <Field label="Amount (₹)" required><Input type="number" inputMode="decimal" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
          <Field label="Reference"><Input value={reference} onChange={(e) => setReference(e.target.value)} /></Field>
          <Field label="Notes / reason" required><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
          {err && <p className="text-sm text-destructive" role="alert">{err}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={save.isPending} onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={save.isPending || !id} onClick={() => { if (busy.current) return; busy.current = true; setErr(null); save.mutate(); }}>{save.isPending ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Manual entries of one transporter, with Edit and Reverse (a reversal posts an offsetting ledger row; nothing is deleted). */
export function ManualEntriesList({ transporterId, canEdit, onSaved }: { transporterId: string; canEdit: boolean; onSaved?: () => void }) {
  const qc = useQueryClient();
  const [edit, setEdit] = useState<any | null>(null);
  const [rev, setRev] = useState<any | null>(null);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["manual-entries", transporterId],
    queryFn: async () => {
      return fetchAllRows<any>((from, to) => supabase.from("transporter_manual_entries").select("*").eq("transporter_id", transporterId).order("entry_date").order("id").range(from, to));
    },
  });
  const reverse = useMutation({
    mutationFn: async () => {
      if (reason.trim().length < 3) throw new Error("A reason is required");
      const { error } = await supabase.rpc("reverse_transporter_manual_entry" as any, { p_id: rev.id, p_reason: reason } as any);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Entry reversed"); refreshAll(qc); setRev(null); setReason(""); },
    onError: (e) => setErr(errorMessage(e)),
  });
  if (q.isPending) return <LoadingState />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (q.data.length === 0) return <p className="text-sm text-muted-foreground">No manual entries for this transporter.</p>;
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-lg border bg-card"><Table>
        <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Effect</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Reference / notes</TableHead><TableHead>Status</TableHead>{canEdit && <TableHead>Actions</TableHead>}</TableRow></TableHeader>
        <TableBody>{q.data.map((e) => (
          <TableRow key={e.id}>
            <TableCell className="whitespace-nowrap">{formatDate(e.entry_date)}</TableCell>
            <TableCell>{e.direction === "increase_payable" ? "Payable increased" : "Payable reduced"}</TableCell>
            <TableCell className="text-right"><Money value={e.amount} /></TableCell>
            <TableCell>{[e.reference, e.notes].filter(Boolean).join(" · ")}</TableCell>
            <TableCell>{e.is_reversed ? <StatusBadge tone="muted">Reversed: {e.reversal_reason}</StatusBadge> : <StatusBadge tone="success">Posted</StatusBadge>}</TableCell>
            {canEdit && <TableCell>{!e.is_reversed && <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => setEdit(e)}>Edit</Button><Button size="sm" variant="outline" onClick={() => { setErr(null); setReason(""); setRev(e); }}>Reverse</Button></div>}</TableCell>}
          </TableRow>))}</TableBody>
      </Table></div>
      <ManualEntryDialog open={!!edit} onOpenChange={(o) => { if (!o) setEdit(null); }} transporterId={transporterId} entry={edit} onSaved={onSaved} />
      <Dialog open={!!rev} onOpenChange={(o) => { if (!o && !reverse.isPending) setRev(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reverse manual entry</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">The original line stays in the ledger and an offsetting line is added. This cannot be undone.</p>
          <Field label="Reason" required><Input value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
          {err && <p className="text-sm text-destructive" role="alert">{err}</p>}
          <DialogFooter>
            <Button variant="outline" disabled={reverse.isPending} onClick={() => setRev(null)}>Cancel</Button>
            <Button variant="destructive" disabled={reverse.isPending} onClick={() => { setErr(null); reverse.mutate(); }}>{reverse.isPending ? "Reversing…" : "Reverse entry"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
