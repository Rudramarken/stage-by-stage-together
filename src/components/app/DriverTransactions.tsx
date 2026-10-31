import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { driverTransactionSchema } from "@/lib/driver-transactions";
import { useAccounts, useDrivers, useParties, PAY_MODES, nameOf } from "@/lib/lookups";
import { fetchAllRows } from "@/lib/accounts";
import { todayIST, formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Money } from "./ui";
import { SearchSelect } from "./SearchSelect";
import { selectCls } from "./Section";
import { ErrorState, LoadingState, errorMessage } from "./states";

export type DriverRow = Record<string, any>;
export function DriverRows({ rows, setRows, driverId, date }: { rows: DriverRow[]; setRows: (rows: DriverRow[]) => void; driverId?: string; date: string }) {
  const parties = useParties(); const accounts = useAccounts(); const drivers = useDrivers();
  const [err, setErr] = useState("");
  return <div className="space-y-3">
    {rows.map((r, i) => {
      const upd = (p: DriverRow) => setRows(rows.map((x, j) => i === j ? { ...x, ...p } : x));
      return <div key={r.id} className="grid gap-3 rounded-md border p-3 sm:grid-cols-3">
        <Field label="Entry type"><select className={selectCls} value={r.kind} disabled={!!r.saved || !!r.cancel} onChange={e => upd({ kind: e.target.value, party_id: "", account_id: "" })}><option value="expense">Driver Expenses</option><option value="party_receipt">Party paid driver directly</option></select></Field>
        <Field label="Driver" required><SearchSelect value={r.driver_id || driverId} onChange={x => upd({ driver_id: x })} options={(drivers.data ?? []).map(d => ({ value: d.id, label: d.name }))} placeholder="Choose driver" /></Field>
        {r.kind === "party_receipt" && <Field label="Paying party" required><SearchSelect value={r.party_id} onChange={x => upd({ party_id: x })} options={(parties.data ?? []).map(p => ({ value: p.id, label: p.name }))} placeholder="Choose paying party" /></Field>}
        <Field label="Amount (₹)" required><Input aria-label={`${r.kind === "expense" ? "Driver Expenses" : "Party paid driver"} amount`} type="number" min="0" step="0.01" value={r.amount} disabled={!!r.cancel} onChange={e => upd({ amount: e.target.value })} /></Field>
        <Field label="Date" required><Input type="date" value={r.entry_date} disabled={!!r.cancel} onChange={e => upd({ entry_date: e.target.value })} /></Field>
        <Field label="Method"><select className={selectCls} value={r.payment_method} disabled={!!r.cancel} onChange={e => upd({ payment_method: e.target.value })}>{PAY_MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}</select></Field>
        {r.kind === "expense" && <Field label="Reimbursed from account"><select className={selectCls} value={r.account_id || ""} disabled={!!r.cancel} onChange={e => upd({ account_id: e.target.value })}><option value="">Not reimbursed — due to driver</option>{accounts.data?.filter(a => a.is_active || a.id === r.account_id).map(a => <option key={a.id} value={a.id}>{a.display_name}</option>)}</select></Field>}
        <Field label="Reference"><Input value={r.reference || ""} disabled={!!r.cancel} onChange={e => upd({ reference: e.target.value })} /></Field>
        <Field label="Notes"><Input value={r.notes || ""} disabled={!!r.cancel} onChange={e => upd({ notes: e.target.value })} /></Field>
        <div className="flex items-center gap-2 sm:col-span-3">{r.cancel ? <><span className="text-destructive">Cancellation: {r.cancel_reason}</span><Button variant="outline" onClick={() => upd({ cancel: false })}>Undo</Button></> : <Button variant="outline" onClick={() => { if (!r.saved) setRows(rows.filter((_, j) => i !== j)); else { const reason = window.prompt("Cancellation reason (required)"); if (reason?.trim()) upd({ cancel: true, cancel_reason: reason.trim() }); else setErr("Enter a cancellation reason"); } }}>{r.saved ? "Cancel entry" : "Remove entry"}</Button>}</div>
      </div>;
    })}
    <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setRows([...rows, { id: crypto.randomUUID(), driver_id: driverId || "", kind: "expense", amount: "", entry_date: date, payment_method: "cash" }])}>Add Driver Expenses</Button><Button variant="outline" onClick={() => setRows([...rows, { id: crypto.randomUUID(), driver_id: driverId || "", kind: "party_receipt", party_id: "", amount: "", entry_date: date, payment_method: "cash" }])}>Party paid driver directly</Button></div>
    {err && <p role="alert" className="text-destructive">{err}</p>}
  </div>;
}
export function driverRowsPayload(rows: DriverRow[], driverId?: string) {
  return rows.map(r => r.cancel ? { id: r.id, cancel: true, cancel_reason: r.cancel_reason } : driverTransactionSchema.parse({ ...r, reference: r.reference || "", notes: r.notes || "", payment_method: r.payment_method || "cash", driver_id: r.driver_id || driverId, party_id: r.party_id || null, trip_id: r.trip_id || null, account_id: r.kind === "expense" ? r.account_id || null : null }));
}

export function DriverTransactions({ driverId, tripId }: { driverId?: string; tripId?: string }) {
  const qc = useQueryClient(); const parties = useParties(); const accounts = useAccounts();
  const [rows, setRows] = useState<DriverRow[] | null>(null); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false); const guard = useRef(false);
  const q = useQuery({ queryKey: ["driver-transactions", driverId, tripId], queryFn: () => fetchAllRows<any>((from, to) => { let s = supabase.from("driver_transactions").select("*"); if (driverId) s = s.eq("driver_id", driverId); if (tripId) s = s.eq("trip_id", tripId); return s.order("entry_date").order("id").range(from, to); }) });
  async function save() {
    if (!rows || guard.current) return;
    guard.current = true; setBusy(true); setErr("");
    try { const p = driverRowsPayload(rows, driverId).map(r => ({ ...r, trip_id: rows.find(x => x.id === r.id)?.trip_id || tripId || null })); const { error } = await supabase.rpc("save_driver_transactions", { p: p as never }); if (error) throw error; await qc.invalidateQueries(); setRows(null); }
    catch(e) { setErr(errorMessage(e)); } finally { guard.current = false; setBusy(false); }
  }
  if (q.isPending) return <LoadingState />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  return <div className="space-y-3">
    <Button variant="outline" onClick={() => { setErr(""); setRows([]); }}>Add driver entry</Button>
    {q.data.map(r => <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 border-b py-2 text-sm"><div>{formatDate(r.entry_date)} · {r.kind === "expense" ? "Driver Expenses" : `Received directly from ${nameOf(parties.data, r.party_id)}`} · <Money value={r.amount} />{r.account_id && <> · {nameOf(accounts.data, r.account_id, "display_name")}</>} · {r.reference}{r.is_cancelled && <span className="text-destructive"> · Cancelled: {r.cancel_reason}</span>}</div>{!r.is_cancelled && <Button variant="outline" size="sm" onClick={() => { setErr(""); setRows([{ ...r, amount: String(r.amount), saved: true }]); }}>Edit / cancel</Button>}</div>)}
    <Dialog open={rows !== null} onOpenChange={o => { if (!o && !busy) setRows(null); }}><DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto"><DialogHeader><DialogTitle>Driver entries</DialogTitle></DialogHeader>{rows && <DriverRows rows={rows} setRows={setRows} driverId={driverId} date={todayIST()} />}{err && <p role="alert" className="text-destructive">{err}</p>}<Button disabled={busy || !rows?.length} onClick={save}>{busy ? "Saving…" : "Save driver entries"}</Button></DialogContent></Dialog>
  </div>;
}