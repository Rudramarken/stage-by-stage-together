import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Field, Money } from "./ui";
import { Section, selectCls } from "./Section";
import { SearchSelect } from "./SearchSelect";
import { errorMessage } from "./states";
import { useDrivers, useVehicles, useTransporters } from "@/lib/lookups";
import { TransporterSelect } from "./TransporterSelect";
import { todayIST } from "@/lib/format";

// Stops stay in the type because older screens/records still carry them. The Trip form no longer edits them.
export type Stop = { id?: string; location: string; stop_type: string; status: string; planned_arrival?: string; actual_arrival?: string; notes?: string };
export type TripValues = Record<string, any> & { stops: Stop[] };

const toLocal = (v?: string | null) => (v ? new Date(v).toISOString().slice(0, 16) : "");

export function tripToForm(t: any, stops: any[]): TripValues {
  return {
    ...t,
    stops: stops.map((s) => ({ ...s, planned_arrival: toLocal(s.planned_arrival), actual_arrival: toLocal(s.actual_arrival) })),
  };
}

// Always-visible trip expense categories: the user only types the amount.
const STD_EXPENSES = ["TOLL TAX", "CNG", "FOOD", "POLICE"] as const;
type StdRow = { amount: string; id?: string };
type CustomRow = { category: string; amount: string; id?: string };
type AdvRow = { driver_id: string; amount: string; advance_date: string; reference: string; id?: string };

export function TripForm({ initial }: { initial?: TripValues }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const vehicles = useVehicles(); const drivers = useDrivers(); const transporters = useTransporters();
  // journey_type / direction / status are no longer shown, but their saved values stay in this state and are sent back unchanged.
  const [v, setV] = useState<TripValues>(initial ?? {
    trip_date: todayIST(), journey_type: "single", direction: "up", status: "booked", vehicle_mode: "own", stops: [],
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Once save_trip succeeds we keep the id, so pressing Save again after a later failure UPDATES the same trip (never a duplicate).
  const [tripId, setTripId] = useState<string | null>((initial?.id as string | undefined) ?? null);
  const [std, setStd] = useState<Record<string, StdRow>>({});
  const [custom, setCustom] = useState<CustomRow[]>([]);
  const [advs, setAdvs] = useState<AdvRow[]>([]);
  const set = (k: string, val: unknown) => setV((p) => ({ ...p, [k]: val }));

  const stdTotal = STD_EXPENSES.reduce((s, c) => s + (Number(std[c]?.amount) > 0 ? Number(std[c]?.amount) : 0), 0);
  const customTotal = custom.reduce((s, r) => s + (Number(r.amount) > 0 ? Number(r.amount) : 0), 0);
  const advTotal = advs.reduce((s, r) => s + (Number(r.amount) > 0 ? Number(r.amount) : 0), 0);

  async function save() {
    if (busy) return;
    setErr(null);
    if (v.vehicle_mode === "market" && !v.market_vehicle_number?.trim()) return setErr("Enter the market truck's vehicle number");
    if (v.commission_enabled && !v.transporter_id) return setErr("Choose the transporter who owes commission");
    if (initial?.commission_enabled && !v.commission_enabled && !v.commission_cancel_reason?.trim()) return setErr("Enter a reason for turning commission off");
    for (const r of custom) {
      if (!r.id && (r.category.trim() || r.amount) && (!r.category.trim() || !(Number(r.amount) > 0))) return setErr("Each custom expense needs a name and an amount greater than 0");
    }
    for (const r of advs) {
      if (r.id) continue;
      if (!(Number(r.amount) > 0)) return setErr("Each driver advance needs an amount greater than 0");
      if (!(r.driver_id || v.driver_id)) return setErr("Choose the driver for every advance");
    }
    for (const c of STD_EXPENSES) if (std[c]?.amount && !std[c]?.id && !(Number(std[c].amount) > 0)) return setErr(`${c}: amount must be greater than 0`);

    setBusy(true);
    let id = tripId;
    try {
      if (!id) {
        // Stops are not edited here any more: leaving `stops` out means save_trip does not touch existing stops.
        const { stops: _omit, ...payload } = v;
        void _omit;
        const { data, error } = await supabase.rpc("save_trip", { p: payload as never });
        if (error) throw error;
        id = data as string;
        setTripId(id);
        setV((p) => ({ ...p, id }));
      } else {
        const { stops: _omit, ...payload } = { ...v, id };
        void _omit;
        const { error } = await supabase.rpc("save_trip", { p: payload as never });
        if (error) throw error;
      }
    } catch (e) { setErr(errorMessage(e)); setBusy(false); return; }

    // Expenses and advances are saved one by one; a row that is saved gets its id and is never inserted again.
    const failures: string[] = [];
    for (const c of STD_EXPENSES) {
      const r = std[c];
      if (!r || r.id || !(Number(r.amount) > 0)) continue;
      const res = await supabase.from("expenses").insert({ scope: "trip", trip_id: id, category: c, amount: Number(r.amount), expense_date: v.trip_date, payment_method: "cash", responsible: "gokul" } as never).select("id").single();
      if (res.error) failures.push(`${c}: ${errorMessage(res.error)}`);
      else setStd((p) => ({ ...p, [c]: { ...p[c], id: (res.data as any).id } }));
    }
    for (let i = 0; i < custom.length; i++) {
      const r = custom[i];
      if (r.id || !(Number(r.amount) > 0) || !r.category.trim()) continue;
      const res = await supabase.from("expenses").insert({ scope: "trip", trip_id: id, category: r.category.trim(), amount: Number(r.amount), expense_date: v.trip_date, payment_method: "cash", responsible: "gokul" } as never).select("id").single();
      if (res.error) failures.push(`${r.category}: ${errorMessage(res.error)}`);
      else setCustom((p) => p.map((x, j) => (j === i ? { ...x, id: (res.data as any).id } : x)));
    }
    for (let i = 0; i < advs.length; i++) {
      const r = advs[i];
      if (r.id || !(Number(r.amount) > 0)) continue;
      const res = await supabase.from("advances").insert({ trip_id: id, recipient_type: "driver", driver_id: r.driver_id || v.driver_id, advance_date: r.advance_date || v.trip_date, amount: Number(r.amount), payment_method: "cash", reference: r.reference || null } as never).select("id").single();
      if (res.error) failures.push(`Driver advance ${formatRow(r)}: ${errorMessage(res.error)}`);
      else setAdvs((p) => p.map((x, j) => (j === i ? { ...x, id: (res.data as any).id } : x)));
    }
    setBusy(false);
    qc.invalidateQueries();
    if (failures.length) {
      setErr(`Trip was saved, but these entries were NOT saved: ${failures.join("; ")}. Press Save again to retry only the missing ones (nothing is duplicated).`);
      return;
    }
    toast.success("Trip saved");
    nav({ to: "/trips/$id", params: { id: id! } });
  }

  return (
    <div className="space-y-4">
      <Section n={1} title="Trip details">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Trip date" required><Input type="date" value={v.trip_date ?? ""} onChange={(e) => set("trip_date", e.target.value)} /></Field>
          {v.parent_trip_id && <Field label="Leg label" hint="e.g. Return leg, Leg 2"><Input value={v.leg_label ?? ""} onChange={(e) => set("leg_label", e.target.value)} /></Field>}
          <div className="sm:col-span-3"><Field label="Notes"><Textarea value={v.notes ?? ""} onChange={(e) => set("notes", e.target.value)} /></Field></div>
        </div>
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
            <SearchSelect value={v.driver_id} onChange={(x) => setV((p) => ({ ...p, driver_id: x, driver_name: "" }))} placeholder="Choose driver"
              options={(drivers.data ?? []).filter((x) => x.is_active || x.id === v.driver_id).map((x) => ({ value: x.id, label: x.name, hint: x.phone ?? "" }))} />
          </Field>
          {!v.driver_id && <Field label="…or type driver name"><Input value={v.driver_name ?? ""} onChange={(e) => set("driver_name", e.target.value)} /></Field>}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">LR / Bilty: create it from the LR / Bilty Register and pick this trip there (consignor, consignee, rate and weight are entered on the LR).</p>
      </Section>

      <Section n={3} title="Trip expenses">
        <p className="mb-3 text-sm text-muted-foreground">Only type the amount. Leave a line empty if there is no such expense.</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {STD_EXPENSES.map((c) => {
            const r = std[c];
            return (
              <Field key={c} label={c}>
                {r?.id ? <p className="flex h-11 items-center gap-1 rounded-md border bg-muted px-3 text-sm"><CheckCircle2 className="h-4 w-4 text-success" />Saved · <Money value={r.amount} /></p>
                  : <Input type="number" min="0" step="0.01" inputMode="decimal" placeholder="Amount (₹)" aria-label={`${c} amount`} value={r?.amount ?? ""} onChange={(e) => setStd((p) => ({ ...p, [c]: { ...p[c], amount: e.target.value } }))} />}
              </Field>
            );
          })}
        </div>
        <div className="mt-4 space-y-2">
          <p className="text-sm font-medium">Other expense (custom)</p>
          {custom.map((r, i) => (
            <div key={i} className="grid items-end gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto]">
              {r.id ? <p className="flex h-11 items-center gap-1 rounded-md border bg-muted px-3 text-sm sm:col-span-3"><CheckCircle2 className="h-4 w-4 text-success" />Saved · {r.category} · <Money value={r.amount} /></p> : <>
                <Field label="Expense name / description"><Input value={r.category} onChange={(e) => setCustom((p) => p.map((x, j) => (j === i ? { ...x, category: e.target.value } : x)))} /></Field>
                <Field label="Amount (₹)"><Input type="number" min="0" step="0.01" inputMode="decimal" value={r.amount} onChange={(e) => setCustom((p) => p.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} /></Field>
                <Button type="button" variant="ghost" size="icon" aria-label={`Remove custom expense ${i + 1}`} onClick={() => setCustom((p) => p.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
              </>}
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => setCustom((p) => [...p, { category: "", amount: "" }])}><Plus className="mr-1 h-4 w-4" />Add other expense</Button>
        </div>
        {initial?.id && <p className="mt-3 text-xs text-muted-foreground">Expenses saved earlier on this trip are listed (and can be edited or cancelled) on the trip page. Entries added here are new.</p>}
      </Section>

      <Section n={4} title="Driver advances">
        <p className="mb-3 text-sm text-muted-foreground">An advance goes to the driver's ledger. It is not counted as a trip expense.</p>
        <div className="space-y-3">
          {advs.map((r, i) => (
            <div key={i} className="grid items-end gap-2 rounded-md border p-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
              {r.id ? <p className="flex h-11 items-center gap-1 text-sm sm:col-span-5"><CheckCircle2 className="h-4 w-4 text-success" />Saved · {drivers.data?.find((d) => d.id === (r.driver_id || v.driver_id))?.name ?? "Driver"} · <Money value={r.amount} /></p> : <>
                <Field label="Driver" required><SearchSelect value={r.driver_id || v.driver_id} onChange={(x) => setAdvs((p) => p.map((a, j) => (j === i ? { ...a, driver_id: x } : a)))} placeholder="Choose driver" allowClear={false}
                  options={(drivers.data ?? []).filter((x) => x.is_active || x.id === r.driver_id).map((x) => ({ value: x.id, label: x.name }))} /></Field>
                <Field label="Amount (₹)" required><Input type="number" min="0" step="0.01" inputMode="decimal" value={r.amount} onChange={(e) => setAdvs((p) => p.map((a, j) => (j === i ? { ...a, amount: e.target.value } : a)))} /></Field>
                <Field label="Date"><Input type="date" value={r.advance_date} onChange={(e) => setAdvs((p) => p.map((a, j) => (j === i ? { ...a, advance_date: e.target.value } : a)))} /></Field>
                <Field label="Reference"><Input value={r.reference} onChange={(e) => setAdvs((p) => p.map((a, j) => (j === i ? { ...a, reference: e.target.value } : a)))} /></Field>
                <Button type="button" variant="ghost" size="icon" aria-label={`Remove advance ${i + 1}`} onClick={() => setAdvs((p) => p.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
              </>}
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => setAdvs((p) => [...p, { driver_id: "", amount: "", advance_date: todayIST(), reference: "" }])}><Plus className="mr-1 h-4 w-4" />Add driver advance</Button>
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

      <Section n={5} title="Summary (entered on this form)">
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div><dt className="text-muted-foreground">Vehicle</dt><dd>{v.vehicle_mode === "own" ? vehicles.data?.find((x) => x.id === v.vehicle_id)?.registration_number ?? "—" : `${v.market_vehicle_number ?? "—"} (market truck)`}</dd></div>
          <div><dt className="text-muted-foreground">Transporter</dt><dd>{transporters.data?.find((x) => x.id === v.transporter_id)?.name ?? "—"}</dd></div>
          <div><dt className="text-muted-foreground">Driver</dt><dd>{drivers.data?.find((x) => x.id === v.driver_id)?.name ?? v.driver_name ?? "—"}</dd></div>
          <div><dt className="text-muted-foreground">Trip expenses entered</dt><dd><Money value={stdTotal + customTotal} /></dd></div>
          <div><dt className="text-muted-foreground">Driver advances entered (kept separate, not an expense)</dt><dd><Money value={advTotal} /></dd></div>
        </dl>
        <p className="mt-2 text-xs text-muted-foreground">Freight, transporter payable, commission and profit for the full trip are shown on the trip page after saving.</p>
      </Section>
      <Section n={6} title="Save">
        {err && <p role="alert" className="mb-3 rounded bg-destructive/10 p-2 text-sm text-destructive">{err}</p>}
        <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save trip"}</Button>
      </Section>
    </div>
  );
}

function formatRow(r: AdvRow) { return `₹${r.amount}`; }
