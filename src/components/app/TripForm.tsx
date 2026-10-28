import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Ban, Plus, Trash2, Undo2 } from "lucide-react";
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
import { useAccounts, useDrivers, useVehicles, useTransporters, useRoutes, nameOf, PAY_MODES, TRIP_STATUS } from "@/lib/lookups";
import { TransporterSelect } from "./TransporterSelect";
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

export function TripForm({ initial, initialExpenses, initialAdvances }: { initial?: TripValues; initialExpenses?: any[]; initialAdvances?: any[] }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const vehicles = useVehicles(); const drivers = useDrivers(); const transporters = useTransporters(); const routes = useRoutes(); const accounts = useAccounts();
  // Rows keep their saved ids (or a browser-made id for new rows), so saving again - or retrying a failed request - updates the same records instead of duplicating them.
  const [exp, setExp] = useState<ExpenseForm>(() => expensesToForm(initialExpenses, ""));
  const [adv, setAdv] = useState<AdvanceRow[]>(() => advancesToForm(initialAdvances));
  const [clientId] = useState(() => newId());
  const [v, setV] = useState<TripValues>(initial ?? {
    trip_date: todayIST(), journey_type: "single", direction: "up", status: "booked", vehicle_mode: "own",
    stops: [{ location: "", stop_type: "loading", status: "planned" }, { location: "", stop_type: "unloading", status: "planned" }],
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: string, val: unknown) => setV({ ...v, [k]: val });
  const setStop = (i: number, k: keyof Stop, val: string) => setV({ ...v, stops: v.stops.map((s, j) => (j === i ? { ...s, [k]: val } : s)) });
  const move = (i: number, d: number) => { const s = [...v.stops]; const j = i + d; if (j < 0 || j >= s.length) return; [s[i], s[j]] = [s[j], s[i]]; setV({ ...v, stops: s }); };

  function applyRoute(id: string) {
    const r = routes.data?.find((x) => x.id === id);
    if (!r) return;
    const s = [...v.stops];
    s[0] = { ...s[0], location: r.origin };
    s[s.length - 1] = { ...s[s.length - 1], location: r.destination };
    setV({ ...v, stops: s });
  }

  async function save() {
    if (busy) return;
    setErr(null);
    if (v.stops.length < 2) return setErr("Add at least a first and a last stop");
    if (v.stops.some((s) => !s.location.trim())) return setErr("Every stop needs a location");
    if (v.vehicle_mode === "market" && !v.market_vehicle_number?.trim()) return setErr("Enter the market truck's vehicle number");
    if (v.status === "cancelled" && !v.cancel_reason?.trim()) return setErr("Enter a reason for cancelling");
    if (v.commission_enabled && !v.transporter_id) return setErr("Choose the transporter who owes commission");
    if (initial?.commission_enabled && !v.commission_enabled && !v.commission_cancel_reason?.trim()) return setErr("Enter a reason for turning commission off");
    const expErr = validateExpenses(exp); if (expErr) return setErr(expErr);
    const advErr = validateAdvances(adv, v.driver_id); if (advErr) return setErr(advErr);
    setBusy(true);
    try {
      const payload = { ...v, client_id: initial?.id ? undefined : clientId, expenses: expensesPayload(exp, v.trip_date), advances: advancesPayload(adv, v.driver_id), stops: v.stops.map((s) => ({ ...s, planned_arrival: s.planned_arrival ? new Date(s.planned_arrival).toISOString() : "", actual_arrival: s.actual_arrival ? new Date(s.actual_arrival).toISOString() : "" })) };
      const { data, error } = await supabase.rpc("save_trip", { p: payload as never });
      if (error) throw error;
      toast.success("Trip saved");
      qc.invalidateQueries();
      nav({ to: "/trips/$id", params: { id: data as string } });
    } catch (e) { setErr(errorMessage(e)); } finally { setBusy(false); }
  }

  const summary = v.stops.map((s) => s.location || "?").join(" → ");
  const expTotal = expenseTotal(exp);
  const advTotal = advanceTotal(adv);

  return (
    <div className="space-y-4">
      <Section n={1} title="Journey type & details">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Journey type">
            <select className={selectCls} value={v.journey_type} onChange={(e) => set("journey_type", e.target.value)}>
              <option value="single">Single Journey</option><option value="multi">Multi-Stop Journey</option><option value="round">Round Trip (Up + Down)</option>
            </select>
          </Field>
          <Field label="Trip date" required><Input type="date" value={v.trip_date ?? ""} onChange={(e) => set("trip_date", e.target.value)} /></Field>
          <Field label="Direction">
            <select className={selectCls} value={v.direction} onChange={(e) => set("direction", e.target.value)}>
              <option value="up">Up / Outward</option><option value="down">Down / Return</option><option value="other">Other</option>
            </select>
          </Field>
          <Field label="Status">
            <select className={selectCls} value={v.status} onChange={(e) => set("status", e.target.value)}>
              {Object.entries(TRIP_STATUS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
            </select>
          </Field>
          {v.status === "cancelled" && <Field label="Cancel reason" required><Input value={v.cancel_reason ?? ""} onChange={(e) => set("cancel_reason", e.target.value)} /></Field>}
          {v.parent_trip_id && <Field label="Leg label" hint="e.g. Return leg, Leg 2"><Input value={v.leg_label ?? ""} onChange={(e) => set("leg_label", e.target.value)} /></Field>}
          <div className="sm:col-span-3"><Field label="Notes"><Textarea value={v.notes ?? ""} onChange={(e) => set("notes", e.target.value)} /></Field></div>
        </div>
        {v.journey_type === "round" && !v.parent_trip_id && <p className="mt-3 text-sm text-muted-foreground">This is the Outward leg. After saving, use "Create return leg" on the trip page. Nothing is copied automatically.</p>}
      </Section>

      <Section n={2} title="Vehicle, transporter & driver">
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
          <Field label="Transporter" hint="Type a new name to add it once">
            <TransporterSelect value={v.transporter_id} onChange={(x) => set("transporter_id", x)} />
          </Field>
          <Field label="Registered driver">
            <SearchSelect value={v.driver_id} onChange={(x) => setV({ ...v, driver_id: x, driver_name: "" })} placeholder="Choose driver"
              options={(drivers.data ?? []).filter((x) => x.is_active || x.id === v.driver_id).map((x) => ({ value: x.id, label: x.name, hint: x.phone ?? "" }))} />
          </Field>
          {!v.driver_id && <Field label="…or type driver name"><Input value={v.driver_name ?? ""} onChange={(e) => set("driver_name", e.target.value)} /></Field>}
        </div>
      </Section>

      <Section n={3} title="Route & stops">
        {(routes.data?.length ?? 0) > 0 && (
          <div className="mb-3 max-w-sm"><Field label="Fill first/last stop from a saved route (optional)">
            <select className={selectCls} defaultValue="" onChange={(e) => applyRoute(e.target.value)}>
              <option value="">—</option>{(routes.data ?? []).filter((r) => r.is_active).map((r) => <option key={r.id} value={r.id}>{r.origin} → {r.destination}</option>)}
            </select></Field></div>
        )}
        <p className="mb-3 text-sm font-medium text-primary">{summary}</p>
        <div className="space-y-3">
          {v.stops.map((s, i) => (
            <div key={i} className="grid items-end gap-2 rounded-md border p-3 sm:grid-cols-12">
              <div className="sm:col-span-3"><Field label={i === 0 ? "First stop" : i === v.stops.length - 1 ? "Last stop" : `Stop ${i + 1}`} required>
                <Input value={s.location} onChange={(e) => setStop(i, "location", e.target.value)} placeholder="Type any place" /></Field></div>
              <div className="sm:col-span-2"><Field label="Type"><select className={selectCls} value={s.stop_type} onChange={(e) => setStop(i, "stop_type", e.target.value)}>
                <option value="loading">Loading</option><option value="unloading">Unloading</option><option value="both">Both</option><option value="intermediate">Intermediate</option></select></Field></div>
              <div className="sm:col-span-2"><Field label="Planned arrival"><Input type="datetime-local" value={s.planned_arrival ?? ""} onChange={(e) => setStop(i, "planned_arrival", e.target.value)} /></Field></div>
              <div className="sm:col-span-2"><Field label="Actual arrival"><Input type="datetime-local" value={s.actual_arrival ?? ""} onChange={(e) => setStop(i, "actual_arrival", e.target.value)} /></Field></div>
              <div className="sm:col-span-2"><Field label="Status"><select className={selectCls} value={s.status} onChange={(e) => setStop(i, "status", e.target.value)}>
                <option value="planned">Planned</option><option value="arrived">Arrived</option><option value="completed">Completed</option><option value="skipped">Skipped</option></select></Field></div>
              <div className="flex gap-1 sm:col-span-1">
                <Button type="button" variant="ghost" size="icon" onClick={() => move(i, -1)} aria-label="Move up"><ArrowUp className="h-4 w-4" /></Button>
                <Button type="button" variant="ghost" size="icon" onClick={() => move(i, 1)} aria-label="Move down"><ArrowDown className="h-4 w-4" /></Button>
                <Button type="button" variant="ghost" size="icon" disabled={v.stops.length <= 2} onClick={() => setV({ ...v, stops: v.stops.filter((_, j) => j !== i) })} aria-label="Remove"><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>
          ))}
        </div>
        <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => {
          const s = [...v.stops]; s.splice(s.length - 1, 0, { location: "", stop_type: "intermediate", status: "planned" }); setV({ ...v, stops: s });
        }}><Plus className="mr-1 h-4 w-4" />Add stop</Button>
      </Section>

      <Section n={4} title="Loads & LR / Bilties" defaultOpen={false}>
        <p className="text-sm text-muted-foreground">After saving, open the trip and use "Add LR to this trip" or link an existing LR. Each LR picks its loading and unloading stop from this trip.</p>
      </Section>
      <Section n={5} title={`Trip expenses${expTotal > 0 ? ` · ${formatINR(expTotal)}` : ""}`}>
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
      <Section n={6} title={`Driver advance${advTotal > 0 ? ` · ${formatINR(advTotal)}` : ""}`}>
        <p className="mb-3 text-sm text-muted-foreground">Money given to the driver for this trip. It goes to the driver ledger and is kept separate from trip expenses. Saving again updates the same advance; it never creates a second one. Advances to a transporter or truck owner are recorded on the trip page.</p>
        {!v.driver_id && adv.some((r) => !r.saved) && <p className="mb-3 rounded bg-warning/20 p-2 text-sm">Choose a registered driver in "Vehicle, transporter & driver" - an advance to a typed driver name cannot reach a driver ledger.</p>}
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
      <Section n={7} title="Summary">
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div><dt className="text-muted-foreground">Route</dt><dd>{summary}</dd></div>
          <div><dt className="text-muted-foreground">Vehicle</dt><dd>{v.vehicle_mode === "own" ? vehicles.data?.find((x) => x.id === v.vehicle_id)?.registration_number ?? "—" : `${v.market_vehicle_number ?? "—"} (market truck)`}</dd></div>
          <div><dt className="text-muted-foreground">Transporter</dt><dd>{transporters.data?.find((x) => x.id === v.transporter_id)?.name ?? "—"}</dd></div>
          <div><dt className="text-muted-foreground">Driver</dt><dd>{drivers.data?.find((x) => x.id === v.driver_id)?.name ?? v.driver_name ?? "—"}</dd></div>
          <div><dt className="text-muted-foreground">Trip expenses entered</dt><dd>{expTotal > 0 ? <Money value={expTotal} /> : "None recorded"}</dd></div>
          <div><dt className="text-muted-foreground">Driver advance entered</dt><dd>{advTotal > 0 ? <Money value={advTotal} /> : "None recorded"}</dd></div>
        </dl>
      </Section>
      <Section n={8} title="Save">
        {err && <p className="mb-3 rounded bg-destructive/10 p-2 text-sm text-destructive">{err}</p>}
        <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save trip"}</Button>
      </Section>
    </div>
  );
}
