import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Field, Money, StatusBadge } from "./ui";
import { selectCls } from "./Section";
import { ErrorState, LoadingState, errorMessage } from "./states";
import { formatDate, todayIST } from "@/lib/format";
import { fetchAllRows } from "@/lib/accounts";

// Writes go through the database functions of migration 0024 (save_party_manual_entry, reverse_party_manual_entry, set_party_opening).
// They are not in the generated types yet, so they are addressed untyped in this one file.
const sb = supabase as any;
const refreshAll = (qc: ReturnType<typeof useQueryClient>) => qc.invalidateQueries();
const hasMoreThan2dp = (n: number) => Math.abs(n * 100 - Math.round(n * 100)) > 1e-6;

/** Meaning of Debit / Credit on a party ledger, shown wherever an entry is made so the choice is never a guess. */
export const PARTY_CONVENTION = "Party ledger: DEBIT increases what the party owes Gokul (receivable, e.g. freight billed). CREDIT reduces it (e.g. money received). Balance = Debit − Credit; a negative balance means Gokul owes the party (payable).";

/** One opening balance per party. Setting it again corrects that same record (the ledger row is updated in place, never added twice). */
export function PartyOpeningDialog({ open, onOpenChange, party }: { open: boolean; onOpenChange: (o: boolean) => void; party: any }) {
  const qc = useQueryClient();
  const [type, setType] = useState("none");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const hasOpening = !!party && party.opening_type !== "none" && Number(party.opening_balance) > 0;
  useEffect(() => {
    if (!open || !party) return;
    setErr(null); setConfirmed(false);
    setType(party.opening_type && party.opening_type !== "none" ? party.opening_type : "receivable");
    setAmount(Number(party.opening_balance) > 0 ? String(party.opening_balance) : "");
    setDate(party.opening_date ?? "");
  }, [open, party]);
  const save = useMutation({
    mutationFn: async () => {
      if (type !== "none") {
        const n = Number(amount);
        if (!amount.trim() || !(n > 0)) throw new Error("Enter an opening balance greater than 0, or choose None");
        if (hasMoreThan2dp(n)) throw new Error("Opening balance can have at most 2 decimal places");
        if (!date) throw new Error("Opening balance date is required");
      }
      if (hasOpening && !confirmed) throw new Error("Tick the box to confirm that you are correcting the existing opening balance");
      const { error } = await sb.rpc("set_party_opening", { p_party_id: party.id, p_type: type, p_amount: type === "none" ? 0 : Number(amount), p_date: type === "none" ? null : date });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Opening balance saved"); refreshAll(qc); onOpenChange(false); },
    onError: (e) => setErr(errorMessage(e)),
  });
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!save.isPending) onOpenChange(o); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{hasOpening ? "Correct opening balance" : "Set opening balance"} — {party?.name}</DialogTitle>
          <DialogDescription>The balance this party already had before you started using this app. It is one record per party and is never counted as income or expense.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Type" required>
            <select className={selectCls} value={type} onChange={(e) => setType(e.target.value)}>
              <option value="receivable">Receivable — the party owes Gokul (debit)</option>
              <option value="payable">Payable — Gokul owes the party (credit)</option>
              <option value="none">None (remove the opening balance)</option>
            </select>
          </Field>
          {type !== "none" && <>
            <Field label="Amount (₹)" required><Input type="number" inputMode="decimal" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
            <Field label="Balance as on (date)" required hint="The ledger counts this balance from the start of this date."><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          </>}
          {hasOpening && (
            <label className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-2 text-sm">
              <input type="checkbox" className="mt-1" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
              <span>This party already has an opening balance of <b><Money value={party.opening_balance} /> {party.opening_type}</b> dated {formatDate(party.opening_date)}. Saving <b>replaces</b> it (it does not add a second one). The change is recorded in the audit log.</span>
            </label>
          )}
          <p className="text-xs text-muted-foreground">If this party is also a transporter with its own opening balance, enter the old balance in only one place, otherwise both ledgers will show it.</p>
          {err && <p className="text-sm text-destructive" role="alert">{err}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={save.isPending} onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={save.isPending} onClick={() => { setErr(null); save.mutate(); }}>{save.isPending ? "Saving…" : "Save opening balance"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Manual DEBIT or CREDIT entry for one party. The id is created once per form, so a double click, a retry or an edit updates the
 * same row. It posts exactly one ledger line and is NOT recorded as a payment, receipt, expense or settlement.
 */
export function PartyEntryDialog({ open, onOpenChange, partyId, partyName, entry, defaultSide = "debit" }: {
  open: boolean; onOpenChange: (o: boolean) => void; partyId: string; partyName?: string; entry?: any | null; defaultSide?: "debit" | "credit";
}) {
  const qc = useQueryClient();
  const [id, setId] = useState("");
  const [date, setDate] = useState(todayIST());
  const [side, setSide] = useState<"debit" | "credit">("debit");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setErr(null);
    setId(entry?.id ?? crypto.randomUUID());
    setDate(entry?.entry_date ?? todayIST()); setSide(entry?.entry_side ?? defaultSide);
    setAmount(entry ? String(entry.amount) : ""); setReference(entry?.reference ?? ""); setNotes(entry?.notes ?? "");
  }, [open, entry, defaultSide]);
  const save = useMutation({
    mutationFn: async () => {
      if (!partyId) throw new Error("Choose a party first");
      if (!date) throw new Error("Date is required");
      const n = Number(amount);
      if (!amount.trim() || !Number.isFinite(n) || !(n > 0)) throw new Error("Amount must be a number greater than 0");
      if (hasMoreThan2dp(n)) throw new Error("Amount can have at most 2 decimal places");
      if (notes.trim().length < 3) throw new Error("Notes / description are required (at least 3 characters)");
      const { error } = await sb.rpc("save_party_manual_entry", { p_id: id, p_party_id: partyId, p_date: date, p_side: side, p_amount: n, p_reference: reference.trim() || null, p_notes: notes.trim() });
      if (error) throw error;
    },
    onSuccess: () => { toast.success(entry ? "Entry updated" : "Entry added to the ledger"); refreshAll(qc); onOpenChange(false); },
    onError: (e) => setErr(errorMessage(e)),
  });
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!save.isPending) onOpenChange(o); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{entry ? "Edit manual entry" : "Add manual ledger entry"}{partyName ? ` — ${partyName}` : ""}</DialogTitle>
          <DialogDescription>{PARTY_CONVENTION}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <p className="rounded-md border bg-card p-2 text-xs text-muted-foreground">For adjustments only. Do <b>not</b> use this for freight, receipts, payments or advances — those post to the ledger automatically from LRs and Payments &amp; Receipts, and entering them here would count them twice. This entry changes the ledger only; it is not recorded as a payment or receipt.</p>
          <Field label="Entry type" required>
            <select className={selectCls} value={side} onChange={(e) => setSide(e.target.value as "debit" | "credit")}>
              <option value="debit">Debit — party owes Gokul more (receivable up)</option>
              <option value="credit">Credit — party owes Gokul less (receivable down)</option>
            </select>
          </Field>
          <Field label="Date" required><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Amount (₹)" required><Input type="number" inputMode="decimal" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
          <Field label="Reference / voucher no."><Input value={reference} onChange={(e) => setReference(e.target.value)} /></Field>
          <Field label="Notes / description" required><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
          {err && <p className="text-sm text-destructive" role="alert">{err}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={save.isPending} onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={save.isPending} onClick={() => { setErr(null); save.mutate(); }}>{save.isPending ? "Saving…" : entry ? "Save changes" : "Save entry"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Manual entries of one party with Edit and Reverse (a reversal posts an offsetting ledger line; nothing is deleted). */
export function PartyManualEntriesList({ partyId, canEdit }: { partyId: string; canEdit: boolean }) {
  const qc = useQueryClient();
  const [edit, setEdit] = useState<any | null>(null);
  const [rev, setRev] = useState<any | null>(null);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["party-manual-entries", partyId],
    queryFn: () => fetchAllRows<any>((from, to) => sb.from("party_manual_entries").select("*").eq("party_id", partyId).order("entry_date").order("created_at").range(from, to)),
  });
  const reverse = useMutation({
    mutationFn: async () => {
      if (reason.trim().length < 3) throw new Error("A reason is required");
      const { error } = await sb.rpc("reverse_party_manual_entry", { p_id: rev.id, p_reason: reason.trim() });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Entry reversed"); refreshAll(qc); setRev(null); setReason(""); },
    onError: (e) => setErr(errorMessage(e)),
  });
  if (q.isPending) return <LoadingState />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (q.data.length === 0) return <p className="text-sm text-muted-foreground">No manual entries for this party.</p>;
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-lg border bg-card"><Table>
        <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Reference / notes</TableHead><TableHead>Status</TableHead>{canEdit && <TableHead>Actions</TableHead>}</TableRow></TableHeader>
        <TableBody>{q.data.map((e) => (
          <TableRow key={e.id}>
            <TableCell className="whitespace-nowrap">{formatDate(e.entry_date)}</TableCell>
            <TableCell>{e.entry_side === "debit" ? "Debit" : "Credit"}</TableCell>
            <TableCell className="text-right"><Money value={e.amount} /></TableCell>
            <TableCell className="whitespace-normal">{[e.reference, e.notes].filter(Boolean).join(" · ")}</TableCell>
            <TableCell>{e.is_reversed ? <StatusBadge tone="muted">Reversed: {e.reversal_reason}</StatusBadge> : <StatusBadge tone="success">Posted</StatusBadge>}</TableCell>
            {canEdit && <TableCell>{!e.is_reversed && <div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => setEdit(e)}>Edit</Button><Button size="sm" variant="outline" onClick={() => { setErr(null); setReason(""); setRev(e); }}>Reverse</Button></div>}</TableCell>}
          </TableRow>))}</TableBody>
      </Table></div>
      <PartyEntryDialog open={!!edit} onOpenChange={(o) => { if (!o) setEdit(null); }} partyId={partyId} entry={edit} />
      <Dialog open={!!rev} onOpenChange={(o) => { if (!o && !reverse.isPending) setRev(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reverse manual entry</DialogTitle><DialogDescription>The original line stays in the ledger and an offsetting line is added. This cannot be undone.</DialogDescription></DialogHeader>
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
