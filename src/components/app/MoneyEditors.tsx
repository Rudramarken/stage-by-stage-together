import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, Plus, Ban } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Field, Money, StatusBadge } from "./ui";
import { selectCls } from "./Section";
import { SearchSelect } from "./SearchSelect";
import { LoadingState, ErrorState, errorMessage } from "./states";
import { EXPENSE_CATEGORIES, PAY_MODES, useAccounts, useDrivers, useParties, useTransporters, nameOf, createTransporterInline } from "@/lib/lookups";
import { formatDate, todayIST } from "@/lib/format";

function useCancel(table: "expenses" | "advances", key: unknown[]) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { error } = await supabase.from(table).update({ is_cancelled: true, cancel_reason: reason } as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Cancelled"); qc.invalidateQueries({ queryKey: key }); qc.invalidateQueries({ queryKey: ["ledger"] }); },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

function askReason(): string | null {
  const r = window.prompt("Reason for cancelling this entry (required):");
  return r && r.trim() ? r.trim() : null;
}

export function TripExpenses({ tripId }: { tripId: string }) {
  const qc = useQueryClient();
  const key = ["trip-expenses", tripId];
  const accounts = useAccounts();
  const q = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase.from("expenses").select("*").eq("trip_id", tripId).eq("scope", "trip").order("expense_date");
      if (error) throw error;
      return data;
    },
  });
  const [edit, setEdit] = useState<Record<string, any> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: async (e: Record<string, any>) => {
      if (!(Number(e.amount) > 0)) throw new Error("Amount must be greater than 0");
      const row = { scope: "trip", trip_id: tripId, category: e.category, amount: Number(e.amount), expense_date: e.expense_date, paid_to: e.paid_to || null,
        paid_by: e.paid_by || null, payment_method: e.payment_method || null, account_id: e.account_id || null, reference: e.reference || null, notes: e.notes || null, responsible: "gokul" };
      const r = e.id ? await supabase.from("expenses").update(row as never).eq("id", e.id).select().single() : await supabase.from("expenses").insert(row as never).select().single();
      if (r.error) throw r.error;
    },
    onSuccess: () => { toast.success("Expense saved"); setEdit(null); qc.invalidateQueries({ queryKey: key }); qc.invalidateQueries({ queryKey: ["trip-summary", tripId] }); },
    onError: (e) => setErr(errorMessage(e)),
  });
  const cancel = useCancel("expenses", key);
  if (q.isPending) return <LoadingState />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const active = q.data.filter((x) => !x.is_cancelled);
  const total = active.reduce((s, x) => s + Number(x.amount), 0);
  return (
    <div>
      <div className="mb-2 flex justify-end"><Button size="sm" onClick={() => { setErr(null); setEdit({ category: "Diesel/Fuel", expense_date: todayIST(), payment_method: "cash" }); }}><Plus className="mr-1 h-4 w-4" />Add expense</Button></div>
      {q.data.length === 0 ? <p className="text-sm text-muted-foreground">No trip expenses yet.</p> : (
        <div className="overflow-x-auto rounded border">
          <Table>
            <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Category</TableHead><TableHead>Paid to</TableHead><TableHead>Method</TableHead><TableHead className="text-right">Amount</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>{q.data.map((x) => (
              <TableRow key={x.id} className={x.is_cancelled ? "opacity-50" : ""}>
                <TableCell>{formatDate(x.expense_date)}</TableCell><TableCell>{x.category}{x.is_cancelled && <StatusBadge tone="danger">Cancelled</StatusBadge>}</TableCell>
                <TableCell>{x.paid_to ?? "—"}</TableCell><TableCell>{x.payment_method ?? "—"}{x.account_id ? ` · ${nameOf(accounts.data, x.account_id, "display_name")}` : ""}</TableCell>
                <TableCell className="text-right"><Money value={x.amount} /></TableCell>
                <TableCell className="whitespace-nowrap text-right">{!x.is_cancelled && <>
                  <Button variant="ghost" size="sm" onClick={() => { setErr(null); setEdit(x); }}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="sm" onClick={() => { const r = askReason(); if (r) cancel.mutate({ id: x.id, reason: r }); }}><Ban className="h-4 w-4" /></Button></>}</TableCell>
              </TableRow>))}</TableBody>
            <TableFooter><TableRow><TableCell colSpan={4}>Total trip expenses</TableCell><TableCell className="text-right"><Money value={total} /></TableCell><TableCell /></TableRow></TableFooter>
          </Table>
        </div>
      )}
      <Dialog open={!!edit} onOpenChange={(o) => !o && !save.isPending && setEdit(null)}>
        <DialogContent><DialogHeader><DialogTitle>{edit?.id ? "Edit" : "Add"} trip expense</DialogTitle></DialogHeader>
          {edit && <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Category" required><select className={selectCls} value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })}>{EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
            <Field label="Amount (₹)" required><Input type="number" min="0" step="0.01" value={edit.amount ?? ""} onChange={(e) => setEdit({ ...edit, amount: e.target.value })} /></Field>
            <Field label="Date" required><Input type="date" value={edit.expense_date ?? ""} onChange={(e) => setEdit({ ...edit, expense_date: e.target.value })} /></Field>
            <Field label="Paid to"><Input value={edit.paid_to ?? ""} onChange={(e) => setEdit({ ...edit, paid_to: e.target.value })} /></Field>
            <Field label="Paid by"><Input value={edit.paid_by ?? ""} onChange={(e) => setEdit({ ...edit, paid_by: e.target.value })} /></Field>
            <Field label="Payment method"><select className={selectCls} value={edit.payment_method ?? ""} onChange={(e) => setEdit({ ...edit, payment_method: e.target.value })}>{PAY_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</select></Field>
            <Field label="Cash / bank account"><select className={selectCls} value={edit.account_id ?? ""} onChange={(e) => setEdit({ ...edit, account_id: e.target.value })}><option value="">—</option>{accounts.data?.filter((a) => a.is_active).map((a) => <option key={a.id} value={a.id}>{a.display_name}</option>)}</select></Field>
            <Field label="Reference"><Input value={edit.reference ?? ""} onChange={(e) => setEdit({ ...edit, reference: e.target.value })} /></Field>
            <div className="sm:col-span-2"><Field label="Notes"><Input value={edit.notes ?? ""} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} /></Field></div>
            {err && <p className="rounded bg-destructive/10 p-2 text-sm text-destructive sm:col-span-2">{err}</p>}
          </div>}
          <DialogFooter><Button variant="outline" onClick={() => setEdit(null)} disabled={save.isPending}>Cancel</Button><Button onClick={() => edit && save.mutate(edit)} disabled={save.isPending}>{save.isPending ? "Saving…" : "Save"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function TripAdvances({ tripId, defaultDriverId, defaultTransporterId }: { tripId: string; defaultDriverId?: string | null; defaultTransporterId?: string | null }) {
  const qc = useQueryClient();
  const key = ["trip-advances", tripId];
  const accounts = useAccounts(); const drivers = useDrivers(); const transporters = useTransporters(); const parties = useParties();
  const q = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase.from("advances").select("*").eq("trip_id", tripId).order("advance_date");
      if (error) throw error;
      return data;
    },
  });
  const [edit, setEdit] = useState<Record<string, any> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: async (e: Record<string, any>) => {
      if (!(Number(e.amount) > 0)) throw new Error("Amount must be greater than 0");
      if (e.recipient_type === "driver" && !e.driver_id) throw new Error("Choose the driver (register them on the Drivers page if needed)");
      if (e.recipient_type === "transporter" && !e.transporter_id) throw new Error("Choose the transporter");
      if (e.recipient_type === "truck_owner" && !e.party_id) throw new Error("Choose the truck owner party");
      const row = { trip_id: tripId, recipient_type: e.recipient_type, driver_id: e.recipient_type === "driver" ? e.driver_id : null,
        transporter_id: e.recipient_type === "transporter" ? e.transporter_id : null, party_id: ["truck_owner", "other"].includes(e.recipient_type) ? e.party_id || null : null,
        other_name: e.other_name || null, advance_date: e.advance_date, amount: Number(e.amount), payment_method: e.payment_method || null,
        account_id: e.account_id || null, reference: e.reference || null, notes: e.notes || null };
      const r = e.id ? await supabase.from("advances").update(row as never).eq("id", e.id).select().single() : await supabase.from("advances").insert(row as never).select().single();
      if (r.error) throw r.error;
    },
    onSuccess: () => { toast.success("Advance saved"); setEdit(null); qc.invalidateQueries({ queryKey: key }); qc.invalidateQueries({ queryKey: ["ledger"] }); },
    onError: (e) => setErr(errorMessage(e)),
  });
  const cancel = useCancel("advances", key);
  if (q.isPending) return <LoadingState />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const who = (x: any) => x.recipient_type === "driver" ? `Driver: ${nameOf(drivers.data, x.driver_id)}` : x.recipient_type === "transporter" ? `Transporter: ${nameOf(transporters.data, x.transporter_id)}` : `${x.recipient_type === "truck_owner" ? "Truck owner" : "Other"}: ${nameOf(parties.data, x.party_id) || x.other_name || "—"}`;
  const total = q.data.filter((x) => !x.is_cancelled).reduce((s, x) => s + Number(x.amount), 0);
  return (
    <div>
      <div className="mb-2 flex justify-end"><Button size="sm" onClick={() => { setErr(null); setEdit({ recipient_type: defaultDriverId ? "driver" : "transporter", driver_id: defaultDriverId, transporter_id: defaultTransporterId, advance_date: todayIST(), payment_method: "cash" }); }}><Plus className="mr-1 h-4 w-4" />Add advance</Button></div>
      {q.data.length === 0 ? <p className="text-sm text-muted-foreground">No advances yet.</p> : (
        <div className="overflow-x-auto rounded border"><Table>
          <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Given to</TableHead><TableHead>Method</TableHead><TableHead className="text-right">Amount</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>{q.data.map((x) => (
            <TableRow key={x.id} className={x.is_cancelled ? "opacity-50" : ""}>
              <TableCell>{formatDate(x.advance_date)}</TableCell><TableCell>{who(x)} {x.is_cancelled && <StatusBadge tone="danger">Cancelled</StatusBadge>}</TableCell>
              <TableCell>{x.payment_method ?? "—"}{x.account_id ? ` · ${nameOf(accounts.data, x.account_id, "display_name")}` : ""}</TableCell>
              <TableCell className="text-right"><Money value={x.amount} /></TableCell>
              <TableCell className="whitespace-nowrap text-right">{!x.is_cancelled && <>
                <Button variant="ghost" size="sm" onClick={() => { setErr(null); setEdit(x); }}><Pencil className="h-4 w-4" /></Button>
                <Button variant="ghost" size="sm" onClick={() => { const r = askReason(); if (r) cancel.mutate({ id: x.id, reason: r }); }}><Ban className="h-4 w-4" /></Button></>}</TableCell>
            </TableRow>))}</TableBody>
          <TableFooter><TableRow><TableCell colSpan={3}>Total advances</TableCell><TableCell className="text-right"><Money value={total} /></TableCell><TableCell /></TableRow></TableFooter>
        </Table></div>
      )}
      <Dialog open={!!edit} onOpenChange={(o) => !o && !save.isPending && setEdit(null)}>
        <DialogContent><DialogHeader><DialogTitle>{edit?.id ? "Edit" : "Add"} advance</DialogTitle></DialogHeader>
          {edit && <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Given to" required><select className={selectCls} value={edit.recipient_type} onChange={(e) => setEdit({ ...edit, recipient_type: e.target.value })}>
              <option value="driver">Driver</option><option value="transporter">Transporter</option><option value="truck_owner">Truck Owner</option><option value="other">Other</option></select></Field>
            {edit.recipient_type === "driver" && <Field label="Driver" required><SearchSelect value={edit.driver_id} onChange={(x) => setEdit({ ...edit, driver_id: x })} options={(drivers.data ?? []).map((d) => ({ value: d.id, label: d.name }))} /></Field>}
            {edit.recipient_type === "transporter" && <Field label="Transporter" required><SearchSelect value={edit.transporter_id} onChange={(x) => setEdit({ ...edit, transporter_id: x })} options={(transporters.data ?? []).map((d) => ({ value: d.id, label: d.name }))}
              onCreate={async (t) => { const id = await createTransporterInline(t); qc.invalidateQueries({ queryKey: ["transporters"] }); return id; }} createLabel="Add transporter" /></Field>}
            {["truck_owner", "other"].includes(edit.recipient_type) && <Field label="Party"><SearchSelect value={edit.party_id} onChange={(x) => setEdit({ ...edit, party_id: x })} options={(parties.data ?? []).map((d) => ({ value: d.id, label: d.name }))} /></Field>}
            {edit.recipient_type === "other" && !edit.party_id && <Field label="Name"><Input value={edit.other_name ?? ""} onChange={(e) => setEdit({ ...edit, other_name: e.target.value })} /></Field>}
            <Field label="Amount (₹)" required><Input type="number" min="0" step="0.01" value={edit.amount ?? ""} onChange={(e) => setEdit({ ...edit, amount: e.target.value })} /></Field>
            <Field label="Date" required><Input type="date" value={edit.advance_date ?? ""} onChange={(e) => setEdit({ ...edit, advance_date: e.target.value })} /></Field>
            <Field label="Payment method"><select className={selectCls} value={edit.payment_method ?? ""} onChange={(e) => setEdit({ ...edit, payment_method: e.target.value })}>{PAY_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</select></Field>
            <Field label="Cash / bank account"><select className={selectCls} value={edit.account_id ?? ""} onChange={(e) => setEdit({ ...edit, account_id: e.target.value })}><option value="">—</option>{accounts.data?.filter((a) => a.is_active).map((a) => <option key={a.id} value={a.id}>{a.display_name}</option>)}</select></Field>
            <Field label="Reference"><Input value={edit.reference ?? ""} onChange={(e) => setEdit({ ...edit, reference: e.target.value })} /></Field>
            <Field label="Notes"><Input value={edit.notes ?? ""} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} /></Field>
            {err && <p className="rounded bg-destructive/10 p-2 text-sm text-destructive sm:col-span-2">{err}</p>}
          </div>}
          <DialogFooter><Button variant="outline" onClick={() => setEdit(null)} disabled={save.isPending}>Cancel</Button><Button onClick={() => edit && save.mutate(edit)} disabled={save.isPending}>{save.isPending ? "Saving…" : "Save"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
