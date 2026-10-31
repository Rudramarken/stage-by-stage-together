import { useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Ban, Plus, Trash2, Undo2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Field, Money } from "./ui";
import { EXTRA_EXPENSE_CATEGORIES, FIXED_EXPENSES, advancesPayload, advancesToForm, advanceTotal, blankAdvance, blankExpense, expensesPayload, expensesToForm, expenseTotal, newId, validateAdvances, validateExpenses, type AdvanceRow, type ExpenseForm, type ExpenseRow } from "@/lib/trip-expenses";
import { Section, selectCls } from "./Section";
import { SearchSelect } from "./SearchSelect";
import { errorMessage } from "./states";
import { useAccounts, useDrivers, useVehicles, useTransporters, nameOf, PAY_MODES } from "@/lib/lookups";
import { TransporterSelect } from "./TransporterSelect";
import { TripLrSection } from "./TripLrSection";
import { blankTripLr, isBlankTripLr, tripLrPayload, validateTripLrs, type TripLrDraft } from "@/lib/trip-lrs";
import { DriverRows, driverRowsPayload, type DriverRow } from "./DriverTransactions";
import { formatINR, todayIST } from "@/lib/format";

export type Stop = { id?: string; location: string; stop_type: string; status: string; planned_arrival?: string; actual_arrival?: string; notes?: string };
export type TripValues = Record<string, any> & { stops: Stop[] };

const toLocal = (v?: string | null) => (v ? new Date(v).toISOString().slice(0, 16) : "");

export function tripToForm(t: any, stops: any[]): TripValues {
  return {
    ...t,
    stops: stops.map((s) => ({ ...s, planned_arrival: toLocal(s.planned_arrival), actual_arrival: toLocal(s.actual_arrival) })),
  };
}

function askReason(): string | null {
  const r = window.prompt("Reason for cancelling this saved entry (required):");
  return r && r.trim() ? r.trim() : null;
}

export function TripForm({ initial, initialExpenses, initialAdvances, initialDriverTransactions }: { initial?: TripValues; initialExpenses?: any[]; initialAdvances?: any[]; initialDriverTransactions?: any[] }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const vehicles = useVehicles(); const drivers = useDrivers(); const transporters = useTransporters(); const accounts = useAccounts();
  // Rows keep their saved ids (or a browser-made id for new rows), so saving again - or retrying a failed request - updates the same records instead of duplicating them.
  const [exp, setExp] = useState<ExpenseForm>(() => expensesToForm(initialExpenses, ""));
  const [adv, setAdv] = useState<AdvanceRow[]>(() => advancesToForm(initialAdvances));
  const saving = useRef(false);
  const [driverRows, setDriverRows] = useState<DriverRow[]>((initialDriverTransactions ?? []).map(r => ({ ...r, saved: true, amount: String(r.amount) })));
  const [clientId] = useState(() => newId());
  // journey_type / direction / status are no longer shown in the form, but save_trip resets them to defaults when they are missing,
  // so an edited trip sends back its saved values unchanged (and a new trip gets the same defaults as before).
  const [v, setV] = useState<TripValues>(initial ?? { trip_date: todayIST(), journey_type: "single", direction: "up", status: "booked", vehicle_mode: "own", stops: [] });
  const [lrDrafts, setLrDrafts] = useState<TripLrDraft[]>(() => [blankTripLr()]);
  const [linkIds, setLinkIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: string, val: unknown) => setV({ ...v, [k]: val });
  async function save() {
    if (busy || saving.current) return;
    setErr(null);
    if (v.vehicle_mode === "market" && !v.market_vehicle_number?.trim()) return setErr("Enter the market truck's vehicle number");
    if (v.commission_enabled && !v.transporter_id) return setErr("Choose the transporter who owes commission");
    if (initial?.commission_enabled && !v.commission_enabled && !v.commission_cancel_reason?.trim()) return setErr("Enter a reason for turning commission off");
    const expErr = validateExpenses(exp); if (expErr) return setErr(expErr);
    const advErr = validateAdvances(adv, v.driver_id); if (advErr) return setErr(advErr);
    const lrErr = validateTripLrs(lrDrafts); if (lrErr) return setErr(lrErr);
    let driverPayload;
    try { driverPayload = driverRowsPayload(driverRows, v.driver_id); } catch(e) { return setErr(errorMessage(e)); }
    saving.current = true; setBusy(true);
    let tripId = "";
    try {
      // Stops are left exactly as stored: the form no longer edits them, so the key is not sent (save_trip only touches stops when it is present).
      const { stops: _stops, ...rest } = v;
      const payload = { ...rest, client_id: initial?.id ? undefined : clientId, expenses: expensesPayload(exp, v.trip_date), advances: advancesPayload(adv, v.driver_id), driver_transactions: driverPayload };
      const { data, error } = await supabase.rpc("save_trip", { p: payload as never });
      if (error) throw error;
      tripId = data as string;
      setV((previous) => ({ ...previous, id: tripId }));
    } catch (e) { setErr(errorMessage(e)); saving.current = false; setBusy(false); return; }

    // Step 2: LR / Bilty rows and links. The trip is already saved (and a second Save updates the same trip, because the trip id is reused).
    // Each LR remembers its id once saved, so a retry updates it instead of creating a second LR.
    const work = lrDrafts.map((d) => ({ ...d }));
    try {
      const tripRef = { id: tripId, trip_date: v.trip_date as string, transporter_id: v.transporter_id as string | null };
      for (let i = 0; i < work.length; i++) {
        if (isBlankTripLr(work[i])) continue;
        const { data, error } = await supabase.rpc("save_lr", { p: tripLrPayload(work[i], tripRef) as never });
        if (error) throw new Error(`LR / Bilty ${i + 1} was not saved: ${errorMessage(error)}`);
        const savedLrId = data as string;
        work[i].savedId = savedLrId;
        const savedParties = await supabase.from("lr_parties").select("id,role,seq").eq("lr_id", savedLrId).order("seq");
        if (savedParties.error) throw savedParties.error;
        for (const side of ["consignors", "consignees"] as const) {
          const ids = savedParties.data.filter((p) => p.role === (side === "consignors" ? "consignor" : "consignee"));
          work[i][side] = work[i][side].map((p, j) => ({ ...p, id: ids[j]?.id }));
        }
      }
      const remaining = [...linkIds];
      for (const id of linkIds) {
        const { error } = await supabase.from("lrs").update({ trip_id: tripId } as never).eq("id", id);
        if (error) throw new Error(`Could not link the selected LR: ${errorMessage(error)}`);
        remaining.splice(remaining.indexOf(id), 1);
        setLinkIds([...remaining]);
      }
    } catch (e) {
      setLrDrafts(work);
      qc.invalidateQueries();
      setErr(`The trip was saved, but part of the LR / Bilty step failed. ${errorMessage(e)} Fix it and press Save again: the trip and any LR already saved are updated, never duplicated.`);
      saving.current = false; setBusy(false);
      return;
    }
    toast.success("Trip saved");
    qc.invalidateQueries();
    saving.current = false; setBusy(false);
    nav({ to: "/trips/$id", params: { id: tripId } });
  }

  const vehicleLabel = v.vehicle_mode === "own" ? vehicles.data?.find((x) => x.id === v.vehicle_id)?.registration_number ?? "" : (v.market_vehicle_number ?? "");
  const transporterName = transporters.data?.find((x) => x.id === v.transporter_id)?.name ?? "";
  const lrCount = lrDrafts.filter((d) => !isBlankTripLr(d)).length + linkIds.length;
  const expTotal = expenseTotal(exp);
  const advTotal = advanceTotal(adv);

  const expenseAccountFields = (r: ExpenseRow, upd: (p: Partial<ExpenseRow>) => void) => <div className="grid gap-2 sm:grid-cols-2">
    <Field label="Paid From Account"><select className={selectCls} value={r.account_id || ""} disabled={!!r.cancelReason} onChange={e => upd({ account_id: e.target.value })}><option value="">Choose account…</option>{accounts.data?.filter(a => a.is_active || a.id === r.account_id).map(a => <option key={a.id} value={a.id}>{a.display_name}</option>)}</select></Field>
    <Field label="Payment status"><select className={selectCls} value={r.payment_status || "paid"} disabled={!!r.cancelReason} onChange={e => upd({ payment_status: e.target.value })}><option value="paid">Paid</option><option value="pending">Pending / unpaid</option></select></Field>
    <Field label="Method"><select className={selectCls} value={r.payment_method || "cash"} disabled={!!r.cancelReason} onChange={e => upd({ payment_method: e.target.value })}>{PAY_MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}</select></Field>
    <Field label="Reference"><Input value={r.reference || ""} disabled={!!r.cancelReason} onChange={e => upd({ reference: e.target.value })} /></Field>
  </div>;
  return (
    <div className="space-y-4">
      <Section n={1} title="Trip details">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Trip date" required><Input type="date" value={v.trip_date ?? ""} onChange={(e) => set("trip_date", e.target.value)} /></Field>
          {v.parent_trip_id && <Field label="Leg label" hint="e.g. Return leg, Leg 2"><Input value={v.leg_label ?? ""} onChange={(e) => set("leg_label", e.target.value)} /></Field>}
          <div className="sm:col-span-3"><Field label="Notes"><Textarea value={v.notes ?? ""} onChange={(e) => set("notes", e.target.value)} /></Field></div>
        </div>
      </Section>

      <Section n={2} title="Vehicle & Driver">
        <div className="mb-4 flex gap-4 text-sm">
          <label className="flex items-center gap-2"><input type="radio" checked={v.vehicle_mode === "own"} onChange={() => set("vehicle_mode", "own")} />Gokul vehicle</label>
          <label className="flex items-center gap-2"><input type="radio" checked={v.vehicle_mode === "market"} onChange={() => set("vehicle_mode", "market")} />Market truck (type manually)</label>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {v.vehicle_mode === "own" ? (
            <Field label="Gokul vehicle">
              <SearchSelect value={v.vehicle_id} onChange={(x) => set("vehicle_id", x)} placeholder="Choose vehicle"
                options={(vehicles.data ?? []).filter((x) => x.is_active || x.id === v.vehicle_id).map((x) => ({ value: x.id, label: x.registration_number, hint: x.vehicle_type ?? "" }))} />
            </Field>
          ) : (
            <>
              <Field label="Vehicle number" required><Input value={v.market_vehicle_number ?? ""} onChange={(e) => set("market_vehicle_number", e.target.value)} placeholder="HR35F 3747" /></Field>
              <Field label="Vehicle name/type"><Input value={v.market_vehicle_type ?? ""} onChange={(e) => set("market_vehicle_type", e.target.value)} /></Field>
            </>
          )}
          <Field label="Registered driver">
            <SearchSelect value={v.driver_id} onChange={(x) => setV({ ...v, driver_id: x, driver_name: "" })} placeholder="Choose driver"
              options={(drivers.data ?? []).filter((x) => x.is_active || x.id === v.driver_id).map((x) => ({ value: x.id, label: x.name, hint: x.phone ?? "" }))} />
          </Field>
          {!v.driver_id && <Field label="…or type driver name"><Input value={v.driver_name ?? ""} onChange={(e) => set("driver_name", e.target.value)} /></Field>}
        </div>
      </Section>

      <Section n={3} title={`Consignor, Consignee & Transporter${lrCount > 0 ? ` · ${lrCount} LR / Bilties to save` : ""}`}>
        <div className="mb-4"><Field label="Transporter" hint="Type a new name to add it once"><TransporterSelect value={v.transporter_id} onChange={(x) => set("transporter_id", x)} /></Field></div>
        <TripLrSection tripId={initial?.id} drafts={lrDrafts} setDrafts={setLrDrafts} linkIds={linkIds} setLinkIds={setLinkIds} transporterName={transporterName} vehicleLabel={vehicleLabel} />
      </Section>
      <Section n={4} title={`Trip expenses${expTotal > 0 ? ` · ${formatINR(expTotal)}` : ""}`}>
        <p className="mb-3 text-sm text-muted-foreground">Type amounts directly; a blank box records nothing. Saved amounts are updated in place when you save again, never duplicated. A saved expense is removed only by cancelling it (with a reason), so the history stays.</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {FIXED_EXPENSES.map((x) => {
            const r = exp.fixed[x.key];
            const upd = (patch: Partial<ExpenseRow>) => setExp({ ...exp, fixed: { ...exp.fixed, [x.key]: { ...r, ...patch } } });
            return (
              <div key={x.key} className={`space-y-2 rounded-md border p-3 ${r.cancelReason ? "opacity-60" : ""}`}>
                <Field label={x.category} hint={r.saved && r.category.toUpperCase() !== x.category ? `Saved earlier as "${r.category}"` : undefined}>
                  <Input type="number" inputMode="decimal" min="0" step="0.01" placeholder="₹ amount" value={r.amount} disabled={!!r.cancelReason} onChange={(e) => upd({ amount: e.target.value })} />
                </Field>
                <Input aria-label={`${x.category} note`} placeholder="Note (optional)" value={r.notes} disabled={!!r.cancelReason} onChange={(e) => upd({ notes: e.target.value })} />
                {expenseAccountFields(r, upd)}
                {r.saved && (r.cancelReason
                  ? <div className="flex items-center justify-between gap-2 text-xs text-destructive"><span>Will be cancelled when you save: {r.cancelReason}</span><Button type="button" variant="ghost" size="sm" onClick={() => upd({ cancelReason: undefined })}><Undo2 className="mr-1 h-4 w-4" />Undo</Button></div>
                  : <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => { const reason = askReason(); if (reason) upd({ cancelReason: reason }); }}><Ban className="mr-1 h-4 w-4" />Cancel this expense</Button>)}
              </div>
            );
          })}
        </div>
        <p className="mb-2 mt-5 text-sm font-medium">Additional expenses</p>
        {exp.extra.length === 0 && <p className="text-sm text-muted-foreground">None added. Use "Add expense" for diesel, loading, unloading, parking, repairs or anything else.</p>}
        <div className="space-y-3">
          {exp.extra.map((r, i) => {
            const upd = (patch: Partial<ExpenseRow>) => setExp({ ...exp, extra: exp.extra.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
            const cats = r.category && !EXTRA_EXPENSE_CATEGORIES.includes(r.category) ? [...EXTRA_EXPENSE_CATEGORIES, r.category] : EXTRA_EXPENSE_CATEGORIES;
            const off = !!r.cancelReason;
            return (
              <div key={r.id} className={`grid items-end gap-2 rounded-md border p-3 sm:grid-cols-12 ${off ? "opacity-60" : ""}`}>
                <div className="sm:col-span-3"><Field label="Category" required><select className={selectCls} value={r.category} disabled={off} onChange={(e) => upd({ category: e.target.value })}><option value="">Choose…</option>{cats.map((c) => <option key={c} value={c}>{c}</option>)}</select></Field></div>
                <div className="sm:col-span-2"><Field label="Amount (₹)" required><Input type="number" inputMode="decimal" min="0" step="0.01" value={r.amount} disabled={off} onChange={(e) => upd({ amount: e.target.value })} /></Field></div>
                <div className="sm:col-span-2"><Field label="Date" hint={r.saved ? undefined : "Blank = trip date"}><Input type="date" value={r.expense_date} disabled={off} onChange={(e) => upd({ expense_date: e.target.value })} /></Field></div>
                <div className="sm:col-span-2"><Field label="Paid to"><Input value={r.paid_to} disabled={off} onChange={(e) => upd({ paid_to: e.target.value })} /></Field></div>
                <div className="sm:col-span-2"><Field label="Note"><Input value={r.notes} disabled={off} onChange={(e) => upd({ notes: e.target.value })} /></Field></div>
                <div className="flex justify-end sm:col-span-1">
                  {!r.saved
                    ? <Button type="button" variant="ghost" size="icon" aria-label="Remove this unsaved expense" onClick={() => setExp({ ...exp, extra: exp.extra.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" /></Button>
                    : off
                      ? <Button type="button" variant="ghost" size="icon" aria-label="Undo cancel" onClick={() => upd({ cancelReason: undefined })}><Undo2 className="h-4 w-4" /></Button>
                      : <Button type="button" variant="ghost" size="icon" aria-label="Cancel this saved expense" className="text-destructive" onClick={() => { const reason = askReason(); if (reason) upd({ cancelReason: reason }); }}><Ban className="h-4 w-4" /></Button>}
                </div>
                <div className="sm:col-span-12">{expenseAccountFields(r, upd)}</div>
                {off && <p className="text-xs text-destructive sm:col-span-12">Will be cancelled when you save: {r.cancelReason}</p>}
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setExp({ ...exp, extra: [...exp.extra, blankExpense("", "")] })}><Plus className="mr-1 h-4 w-4" />Add expense</Button>
          <p className="text-sm">Total trip expenses entered: <b><Money value={expTotal} /></b>{expTotal === 0 && <span className="text-muted-foreground"> (none recorded)</span>}</p>
        </div>
      </Section>
      <Section n={5} title={`Driver advance${advTotal > 0 ? ` · ${formatINR(advTotal)}` : ""}`}>
        <p className="mb-3 text-sm text-muted-foreground">Money given to the driver for this trip. It goes to the driver ledger and is kept separate from trip expenses. Saving again updates the same advance; it never creates a second one. Advances to a transporter or truck owner are recorded on the trip page.</p>
        {!v.driver_id && adv.some((r) => !r.saved) && <p className="mb-3 rounded bg-warning/20 p-2 text-sm">Choose a registered driver in "Vehicle & Driver" - an advance to a typed driver name cannot reach a driver ledger.</p>}
        {adv.length === 0 && <p className="text-sm text-muted-foreground">No driver advance entered.</p>}
        <div className="space-y-3">
          {adv.map((r, i) => {
            const upd = (patch: Partial<AdvanceRow>) => setAdv(adv.map((x, j) => (j === i ? { ...x, ...patch } : x)));
            const off = !!r.cancelReason;
            return (
              <div key={r.id} className={`grid items-end gap-2 rounded-md border p-3 sm:grid-cols-12 ${off ? "opacity-60" : ""}`}>
                <div className="sm:col-span-12 text-sm">Driver: <b>{nameOf(drivers.data, r.saved ? r.driver_id : v.driver_id) || (r.saved ? "—" : "Choose a registered driver above")}</b>{r.saved && <span className="text-xs text-muted-foreground"> · saved advance (changing the driver needs cancel + new advance)</span>}</div>
                <div className="sm:col-span-2"><Field label="Amount (₹)" required><Input type="number" inputMode="decimal" min="0" step="0.01" value={r.amount} disabled={off} onChange={(e) => upd({ amount: e.target.value })} /></Field></div>
                <div className="sm:col-span-2"><Field label="Date" required><Input type="date" value={r.advance_date} disabled={off} onChange={(e) => upd({ advance_date: e.target.value })} /></Field></div>
                <div className="sm:col-span-2"><Field label="Method"><select className={selectCls} value={r.payment_method} disabled={off} onChange={(e) => upd({ payment_method: e.target.value })}>{PAY_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</select></Field></div>
                <div className="sm:col-span-2"><Field label="Cash / bank account"><select className={selectCls} value={r.account_id} disabled={off} onChange={(e) => upd({ account_id: e.target.value })}><option value="">—</option>{accounts.data?.filter((a) => a.is_active || a.id === r.account_id).map((a) => <option key={a.id} value={a.id}>{a.display_name}</option>)}</select></Field></div>
                <div className="sm:col-span-2"><Field label="Reference"><Input value={r.reference} disabled={off} onChange={(e) => upd({ reference: e.target.value })} /></Field></div>
                <div className="sm:col-span-2"><Field label="Notes"><Input value={r.notes} disabled={off} onChange={(e) => upd({ notes: e.target.value })} /></Field></div>
                <div className="flex justify-end sm:col-span-12">
                  {!r.saved
                    ? <Button type="button" variant="ghost" size="sm" onClick={() => setAdv(adv.filter((_, j) => j !== i))}><Trash2 className="mr-1 h-4 w-4" />Remove</Button>
                    : off
                      ? <Button type="button" variant="ghost" size="sm" onClick={() => upd({ cancelReason: undefined })}><Undo2 className="mr-1 h-4 w-4" />Undo cancel</Button>
                      : <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => { const reason = askReason(); if (reason) upd({ cancelReason: reason }); }}><Ban className="mr-1 h-4 w-4" />Cancel this advance</Button>}
                </div>
                {off && <p className="text-xs text-destructive sm:col-span-12">Will be cancelled when you save (an offsetting driver-ledger line is posted): {r.cancelReason}</p>}
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setAdv([...adv, blankAdvance(v.trip_date ?? todayIST())])}><Plus className="mr-1 h-4 w-4" />Add driver advance</Button>
          <p className="text-sm">Driver advance entered: <b><Money value={advTotal} /></b></p>
        </div>
      </Section>
      <Section title="Driver Expenses & party payments"><DriverRows rows={driverRows} setRows={setDriverRows} driverId={v.driver_id} date={v.trip_date} /></Section>
      <Section title="Transporter commission (optional)" defaultOpen={!!v.commission_enabled}>
        <label className="flex items-center gap-2 text-sm"><Switch checked={!!v.commission_enabled} onCheckedChange={(enabled) => set("commission_enabled", enabled)} />Commission applicable?</label>
        {v.commission_enabled && <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Field label="Commission type"><select className={selectCls} value={v.commission_mode ?? "fixed"} onChange={(e) => set("commission_mode", e.target.value)}><option value="fixed">Fixed ₹</option><option value="percent">% of this trip's LR freight</option></select></Field>
          <Field label={v.commission_mode === "percent" ? "Percent (%)" : "Amount (₹)"}><Input type="number" min="0" value={v.commission_value ?? ""} onChange={(e) => set("commission_value", e.target.value)} /></Field>
          <Field label="Date"><Input type="date" value={v.commission_date ?? ""} onChange={(e) => set("commission_date", e.target.value)} /></Field>
          <Field label="Reference"><Input value={v.commission_reference ?? ""} onChange={(e) => set("commission_reference", e.target.value)} /></Field>
          <Field label="Notes"><Input value={v.commission_notes ?? ""} onChange={(e) => set("commission_notes", e.target.value)} /></Field>
          <p className="text-sm">Commission due from transporter: <Money value={v.commission_mode === "percent" ? v.commission_amount ?? 0 : v.commission_value ?? 0} /> · {transporters.data?.find((x) => x.id === v.transporter_id)?.name ?? "Choose transporter"}</p>
        </div>}
        {initial?.commission_enabled && !v.commission_enabled && <Field label="Reason for turning commission off" required><Input value={v.commission_cancel_reason ?? ""} onChange={(e) => set("commission_cancel_reason", e.target.value)} /></Field>}
      </Section>
      <Section n={6} title="Summary">
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div><dt className="text-muted-foreground">LR / Bilties to save or link</dt><dd>{lrCount > 0 ? lrCount : "None"}</dd></div>
          <div><dt className="text-muted-foreground">Vehicle</dt><dd>{v.vehicle_mode === "own" ? vehicles.data?.find((x) => x.id === v.vehicle_id)?.registration_number ?? "—" : `${v.market_vehicle_number ?? "—"} (market truck)`}</dd></div>
          <div><dt className="text-muted-foreground">Transporter</dt><dd>{transporters.data?.find((x) => x.id === v.transporter_id)?.name ?? "—"}</dd></div>
          <div><dt className="text-muted-foreground">Driver</dt><dd>{drivers.data?.find((x) => x.id === v.driver_id)?.name ?? v.driver_name ?? "—"}</dd></div>
          <div><dt className="text-muted-foreground">Trip expenses entered</dt><dd>{expTotal > 0 ? <Money value={expTotal} /> : "None recorded"}</dd></div>
          <div><dt className="text-muted-foreground">Driver advance entered</dt><dd>{advTotal > 0 ? <Money value={advTotal} /> : "None recorded"}</dd></div>
        </dl>
      </Section>
      <Section n={7} title="Save">
        {err && <p className="mb-3 rounded bg-destructive/10 p-2 text-sm text-destructive">{err}</p>}
        <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save trip"}</Button>
      </Section>
    </div>
  );
}
