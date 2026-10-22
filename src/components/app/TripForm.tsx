import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "./ui";
import { Section, selectCls } from "./Section";
import { SearchSelect } from "./SearchSelect";
import { errorMessage } from "./states";
import { useDrivers, useVehicles, useTransporters, useRoutes, createTransporterInline, TRIP_STATUS } from "@/lib/lookups";
import { todayIST } from "@/lib/format";

export type Stop = { id?: string; location: string; stop_type: string; status: string; planned_arrival?: string; actual_arrival?: string; notes?: string };
export type TripValues = Record<string, any> & { stops: Stop[] };

const toLocal = (v?: string | null) => (v ? new Date(v).toISOString().slice(0, 16) : "");

export function tripToForm(t: any, stops: any[]): TripValues {
  return {
    ...t,
    stops: stops.map((s) => ({ ...s, planned_arrival: toLocal(s.planned_arrival), actual_arrival: toLocal(s.actual_arrival) })),
  };
}

export function TripForm({ initial }: { initial?: TripValues }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const vehicles = useVehicles(); const drivers = useDrivers(); const transporters = useTransporters(); const routes = useRoutes();
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
    setBusy(true);
    try {
      const payload = { ...v, stops: v.stops.map((s) => ({ ...s, planned_arrival: s.planned_arrival ? new Date(s.planned_arrival).toISOString() : "", actual_arrival: s.actual_arrival ? new Date(s.actual_arrival).toISOString() : "" })) };
      const { data, error } = await supabase.rpc("save_trip", { p: payload as never });
      if (error) throw error;
      toast.success("Trip saved");
      qc.invalidateQueries({ queryKey: ["trips"] });
      qc.invalidateQueries({ queryKey: ["trip", data] });
      nav({ to: "/trips/$id", params: { id: data as string } });
    } catch (e) { setErr(errorMessage(e)); } finally { setBusy(false); }
  }

  const summary = v.stops.map((s) => s.location || "?").join(" → ");

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
            <SearchSelect value={v.transporter_id} onChange={(x) => set("transporter_id", x)} placeholder="Choose or type"
              options={(transporters.data ?? []).map((x) => ({ value: x.id, label: x.name }))}
              onCreate={async (t) => { const id = await createTransporterInline(t); qc.invalidateQueries({ queryKey: ["transporters"] }); return id; }} createLabel="Add transporter" />
          </Field>
          <Field label="Registered driver">
            <SearchSelect value={v.driver_id} onChange={(x) => set("driver_id", x)} placeholder="Choose driver"
              options={(drivers.data ?? []).filter((x) => x.is_active || x.id === v.driver_id).map((x) => ({ value: x.id, label: x.name, hint: x.phone ?? "" }))} />
          </Field>
          {!v.driver_id && <Field label="…or type driver name"><Input value={v.driver_name ?? ""} onChange={(e) => set("driver_name", e.target.value)} /></Field>}
        </div>
      </Section>

      <Section n={3} title="Route & stops">
        {(routes.data?.length ?? 0) > 0 && (
          <div className="mb-3 max-w-sm"><Field label="Fill first/last stop from a saved route (optional)">
            <select className={selectCls} defaultValue="" onChange={(e) => applyRoute(e.target.value)}>
              <option value="">—</option>{routes.data!.filter((r) => r.is_active).map((r) => <option key={r.id} value={r.id}>{r.origin} → {r.destination}</option>)}
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
      <Section n={5} title="Expenses & driver advances" defaultOpen={false}>
        <p className="text-sm text-muted-foreground">After saving, add expenses and advances on the trip page (each entry saved separately).</p>
      </Section>
      <Section n={6} title="Summary">
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div><dt className="text-muted-foreground">Route</dt><dd>{summary}</dd></div>
          <div><dt className="text-muted-foreground">Vehicle</dt><dd>{v.vehicle_mode === "own" ? vehicles.data?.find((x) => x.id === v.vehicle_id)?.registration_number ?? "—" : `${v.market_vehicle_number ?? "—"} (market truck)`}</dd></div>
          <div><dt className="text-muted-foreground">Transporter</dt><dd>{transporters.data?.find((x) => x.id === v.transporter_id)?.name ?? "—"}</dd></div>
          <div><dt className="text-muted-foreground">Driver</dt><dd>{drivers.data?.find((x) => x.id === v.driver_id)?.name ?? v.driver_name ?? "—"}</dd></div>
        </dl>
      </Section>
      <Section n={7} title="Save">
        {err && <p className="mb-3 rounded bg-destructive/10 p-2 text-sm text-destructive">{err}</p>}
        <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save trip"}</Button>
      </Section>
    </div>
  );
}
