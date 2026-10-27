import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Field, Money } from "./ui";
import { Section, selectCls } from "./Section";
import { SearchSelect } from "./SearchSelect";
import { errorMessage } from "./states";
import { useParties, useDrivers, useTransporters, useVehicles, createPartyInline, EXPENSE_CATEGORIES, PAY_MODES } from "@/lib/lookups";
import { TransporterSelect } from "./TransporterSelect";
import { LRDocuments } from "./LRDocuments";
import { calcFreight, validateFreight, RATE_UNIT_LABEL, type RateUnit, type WeightUnit } from "@/lib/freight";
import { formatINR, todayIST } from "@/lib/format";

const r2 = (n: number) => Math.round(n * 100) / 100;
type Exp = Record<string, any>;
type LP = { id?: string; role: "consignor" | "consignee"; party_id: string; goods_description?: string; quantity?: string; weight?: string; loading_point?: string; delivery_point?: string; freight_amount?: string; expenses: Exp[] };
export type LRValues = Record<string, any> & { parties: LP[]; adjustments: { id?: string; kind: "add" | "deduct"; amount: string; reason: string }[] };

export function blankLR(tripId?: string): LRValues {
  return {
    lr_date: todayIST(), trip_id: tripId ?? "", weight_unit: "kg", rate_unit: "fixed", freight_type: "to_pay", delivery_status: "pending",
    freight_payable: "0", direct_payment_enabled: false, commission_enabled: false, commission_mode: "percent", commission_status: "pending",
    parties: [{ role: "consignor", party_id: "", freight_amount: "", expenses: [] }, { role: "consignee", party_id: "", freight_amount: "", expenses: [] }], adjustments: [],
  };
}

export function LRForm({ initial }: { initial: LRValues }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const parties = useParties(); const drivers = useDrivers(); const transporters = useTransporters();
  const vehicles = useVehicles();
  const trips = useQuery({
    queryKey: ["trips-pick"],
    queryFn: async () => {
      const { data, error } = await supabase.from("trips").select("id, trip_number, trip_date, status, transporter_id, vehicle_id, market_vehicle_number, driver_id, driver_name, trip_stops(id, location, seq)").neq("status", "cancelled").order("trip_date", { ascending: false }).limit(300);
      if (error) throw error;
      return data;
    },
  });
  const [v, setV] = useState<LRValues>(initial);
  const isNew = !initial.id;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const inflight = useRef(false);
  const savedId = useRef<string | null>(null);
  // LRs saved before party-wise freight keep their single-party posting and their original Customer freight block. New LRs (and LRs already saved party-wise) enter freight against each consignor/consignee.
  const legacy = !!initial.id && !initial.parties.some((p) => p.freight_amount !== "" && p.freight_amount != null);
  const set = (k: string, val: unknown) => setV((p) => ({ ...p, [k]: val }));
  const setP = (i: number, patch: Partial<LP>) => setV((p) => ({ ...p, parties: p.parties.map((x, j) => (j === i ? { ...x, ...patch } : x)) }));
  const setE = (i: number, k: number, patch: Exp) => setP(i, { expenses: v.parties[i].expenses.map((e, j) => (j === k ? { ...e, ...patch } : e)) });
  // Transporter freight: when a rate unit + rate (+ weight for per-kg/quintal/tonne) are entered, freight payable is auto-calculated. Manual entry still works.
  const setTP = (patch: Record<string, unknown>) => setV((p) => {
    const n: LRValues = { ...p, ...patch };
    const w = n.transporter_weight === "" || n.transporter_weight == null ? null : Number(n.transporter_weight);
    const r = n.transporter_rate === "" || n.transporter_rate == null ? null : Number(n.transporter_rate);
    const ru = n.transporter_rate_unit as RateUnit | "" | undefined;
    if (ru && r != null && !Number.isNaN(r) && (ru === "fixed" || (w != null && w > 0))) n.freight_payable = String(r2(calcFreight(w, (n.transporter_weight_unit || "kg") as WeightUnit, r, ru).base + Number(n.transporter_additions || 0) - Number(n.transporter_shortage || 0)));
    return n;
  });
  // Add (+) / Shortage (−) on the transporter freight. Freight payable stays the single final amount that is saved; the base is whatever remains after removing the current add/shortage.
  const setTAdj = (patch: Record<string, unknown>) => setV((p) => {
    const base = Number(p.freight_payable || 0) - Number(p.transporter_additions || 0) + Number(p.transporter_shortage || 0);
    const n: LRValues = { ...p, ...patch };
    n.freight_payable = String(r2(base + Number(n.transporter_additions || 0) - Number(n.transporter_shortage || 0)));
    return n;
  });
  // Commission = what the consignee paid directly minus the freight payable to the transporter, until the commission is typed by hand.
  const [commissionAuto, setCommissionAuto] = useState(!initial.commission_enabled);

  const trip = trips.data?.find((t) => t.id === v.trip_id);
  const stops = trip ? [...trip.trip_stops].sort((a: any, b: any) => a.seq - b.seq) : [];
  const adj = v.adjustments.map((a) => ({ ...a, amount: Number(a.amount) }));
  const weight = v.weight === "" || v.weight == null ? null : Number(v.weight);
  const rate = v.rate === "" || v.rate == null ? null : Number(v.rate);
  const calc = calcFreight(weight, v.weight_unit as WeightUnit, rate, v.rate_unit as RateUnit, adj);
  const tWeight = v.transporter_weight === "" || v.transporter_weight == null ? null : Number(v.transporter_weight);
  const tRate = v.transporter_rate === "" || v.transporter_rate == null ? null : Number(v.transporter_rate);
  const tUnit = (v.transporter_rate_unit || "") as RateUnit | "";
  const tCalc = tUnit && tRate != null ? calcFreight(tWeight, (v.transporter_weight_unit || "kg") as WeightUnit, tRate, tUnit) : null;
  const pf = v.parties.map((p) => (p.freight_amount === "" || p.freight_amount == null ? null : Number(p.freight_amount)));
  const partyTotal = r2(pf.reduce<number>((a, n) => a + (n != null && Number.isFinite(n) ? n : 0), 0));
  const finalFreight = legacy ? calc.final : partyTotal;
  const commission = !v.commission_enabled ? 0 : v.commission_mode === "percent" ? Math.round(finalFreight * Number(v.commission_value || 0)) / 100 : Number(v.commission_value || 0);
  const partyOpts = (role: string, selected?: string) => (parties.data ?? []).filter((p) => p.is_active || p.id === selected).map((p) => ({ value: p.id, label: p.name, hint: (p.roles ?? []).includes(role) ? "" : (p.roles ?? []).join(", ") }));
  const createParty = async (name: string, role: string) => { const id = await createPartyInline(name, "customer"); await qc.invalidateQueries({ queryKey: ["parties"] }); void role; return id; };

  async function save() {
    if (busy || inflight.current) return;
    if (savedId.current) { nav({ to: "/lr/$id", params: { id: savedId.current } }); return; }
    setErr(null);
    if (!legacy) {
      for (let i = 0; i < pf.length; i++) {
        const n = pf[i];
        if (n == null) continue;
        if (!Number.isFinite(n) || n < 0) return setErr("Freight amounts must be numbers of 0 or more");
        if (Math.abs(n * 100 - Math.round(n * 100)) > 1e-6) return setErr("Freight amounts can have at most 2 decimal places");
      }
      if (!pf.some((n) => n != null)) return setErr("Enter the freight against at least one consignor or consignee");
    }
    const fe = legacy ? validateFreight(weight, rate, v.rate_unit as RateUnit, adj) : validateFreight(weight, partyTotal, "fixed", []);
    if (fe) return setErr(fe);
    if (!v.parties.some((p) => p.role === "consignor" && p.party_id) || !v.parties.some((p) => p.role === "consignee" && p.party_id)) return setErr("Add at least one consignor and one consignee");
    if (v.parties.some((p) => !p.party_id)) return setErr("Choose a party for every consignor/consignee row (or remove the empty row)");
    if (Number(v.freight_payable) < 0) return setErr("Freight payable cannot be negative");
    if (v.transporter_rate_unit && v.transporter_rate !== "" && v.transporter_rate != null) {
      if (Number(v.transporter_rate) < 0) return setErr("Transporter rate cannot be negative");
      if (v.transporter_rate_unit !== "fixed" && !(Number(v.transporter_weight) > 0)) return setErr("Enter the weight on which freight is payable to the transporter");
    }
    if (Number(v.transporter_additions || 0) < 0 || Number(v.transporter_shortage || 0) < 0) return setErr("Transporter add / shortage cannot be negative");
    if (Number(v.transporter_additions || 0) > 0 && !String(v.transporter_additions_reason ?? "").trim()) return setErr("Enter a reason for the amount added to the transporter freight");
    if (Number(v.transporter_shortage || 0) > 0 && !String(v.transporter_shortage_reason ?? "").trim()) return setErr("Enter a reason for the shortage deducted from the transporter freight");
    if (v.direct_payment_enabled && !(Number(v.direct_payment_amount) > 0)) return setErr("Enter the amount the consignee paid the driver directly");
    if (v.commission_enabled && !v.transporter_id && !trip?.transporter_id) return setErr("Choose the transporter who owes the commission");
    if (initial.commission_enabled && !v.commission_enabled && !v.commission_cancel_reason?.trim()) return setErr("Enter a reason for turning commission off");
    for (const p of v.parties) for (const e of p.expenses) if (!(Number(e.amount) > 0)) return setErr("Every consignor/consignee expense needs an amount");
    inflight.current = true;
    setBusy(true);
    try {
      // Party-wise LR: the LR total is the sum of the party freights, stored as a fixed freight so the existing database calculation gives the same total.
      const payload = legacy ? v : { ...v, rate_unit: "fixed", rate: String(partyTotal), adjustments: [] };
      const { data, error } = await supabase.rpc("save_lr", { p: payload as never });
      if (error) throw error;
      if (isNew) savedId.current = data as string;
      toast.success("LR saved");
      qc.invalidateQueries();
      nav({ to: "/lr/$id", params: { id: data as string } });
    } catch (e) {
      const m = errorMessage(e);
      setErr(/lrs_business_id_lr_number_key|duplicate/i.test(m) ? "Could not get a new LR number. Please try saving again." : m);
    } finally { inflight.current = false; setBusy(false); }
  }

  const PartyBlock = ({ role }: { role: "consignor" | "consignee" }) => (
    <div className="space-y-3">
      {v.parties.map((p, i) => p.role !== role ? null : (
        <div key={i} className="rounded-md border p-3">
          <div className="grid gap-3 sm:grid-cols-6">
            <div className={role === "consignor" ? "sm:col-span-2" : legacy ? "sm:col-span-3" : "sm:col-span-2"}><Field label={role === "consignor" ? "Consignor" : "Consignee"} required>
              <SearchSelect value={p.party_id} onChange={(x) => setP(i, { party_id: x })} options={partyOpts("customer", p.party_id)} placeholder="Choose or type new" allowClear={false}
                onCreate={(t) => createParty(t, role)} createLabel="Create party" /></Field></div>
            {role === "consignor" && <div className="sm:col-span-2"><Field label="Goods"><Input value={p.goods_description ?? ""} onChange={(e) => setP(i, { goods_description: e.target.value })} /></Field></div>}
            {role === "consignor" && <div className={legacy ? "sm:col-span-2" : "sm:col-span-1"}><Field label={`Weight (${v.weight_unit})`}><Input type="number" min="0" value={p.weight ?? ""} onChange={(e) => setP(i, { weight: e.target.value })} /></Field></div>}
            {!legacy && <div className={role === "consignor" ? "sm:col-span-1" : "sm:col-span-2"}><Field label="Freight (₹)" hint={role === "consignee" ? "Amount this party owes" : undefined}><Input type="number" min="0" step="0.01" inputMode="decimal" value={p.freight_amount ?? ""} onChange={(e) => setP(i, { freight_amount: e.target.value })} /></Field></div>}
            {role === "consignor" && <div className="sm:col-span-3"><Field label="Loading point"><Input value={p.loading_point ?? ""} onChange={(e) => setP(i, { loading_point: e.target.value })} /></Field></div>}
            <div className={role === "consignor" ? "sm:col-span-3" : legacy ? "sm:col-span-3" : "sm:col-span-2"}><Field label="Delivery point"><Input value={p.delivery_point ?? ""} onChange={(e) => setP(i, { delivery_point: e.target.value })} /></Field></div>
          </div>
          <div className="mt-3 rounded bg-muted/50 p-3">
            <div className="mb-2 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2"><p className="min-w-0 text-sm font-medium">{role === "consignor" ? "Consignor" : "Consignee"} expenses</p>
              <Button type="button" size="sm" variant="outline" onClick={() => setP(i, { expenses: [...p.expenses, { category: "Loading/Unloading", expense_date: todayIST(), responsible: "gokul", payment_status: "paid", payment_method: "cash" }] })}><Plus className="mr-1 h-3 w-3" />Add expense</Button></div>
            {p.expenses.map((e, k) => (
              <div key={k} className="mb-2 grid items-end gap-2 border-b pb-2 sm:grid-cols-8">
                <Field label="Category"><select className={selectCls} value={e.category} onChange={(ev) => setE(i, k, { category: ev.target.value })}>{EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
                <Field label="Amount" required><Input type="number" min="0" value={e.amount ?? ""} onChange={(ev) => setE(i, k, { amount: ev.target.value })} /></Field>
                <Field label="Date"><Input type="date" value={e.expense_date ?? ""} onChange={(ev) => setE(i, k, { expense_date: ev.target.value })} /></Field>
                <Field label="Paid by"><Input value={e.paid_by ?? ""} onChange={(ev) => setE(i, k, { paid_by: ev.target.value })} placeholder="Gokul" /></Field>
                <Field label="Paid to"><Input value={e.paid_to ?? ""} onChange={(ev) => setE(i, k, { paid_to: ev.target.value })} /></Field>
                <Field label="Responsible"><select className={selectCls} value={e.responsible} onChange={(ev) => setE(i, k, { responsible: ev.target.value })}><option value="gokul">Gokul (own expense)</option><option value="party">This party (adds to their bill)</option></select></Field>
                <Field label="Status"><select className={selectCls} value={e.payment_status} onChange={(ev) => setE(i, k, { payment_status: ev.target.value })}><option value="paid">Paid</option><option value="pending">Pending</option></select></Field>
                <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${role} expense ${k + 1}`} onClick={() => setP(i, { expenses: p.expenses.filter((_, j) => j !== k) })}><Trash2 className="h-4 w-4" /></Button>
                <div className="sm:col-span-4"><Field label="Method"><select className={selectCls} value={e.payment_method ?? ""} onChange={(ev) => setE(i, k, { payment_method: ev.target.value })}>{PAY_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</select></Field></div>
                <div className="sm:col-span-4"><Field label="Notes"><Input value={e.notes ?? ""} onChange={(ev) => setE(i, k, { notes: ev.target.value })} /></Field></div>
              </div>
            ))}
            {p.expenses.length === 0 && <p className="text-xs text-muted-foreground">None.</p>}
          </div>
          {v.parties.filter((x) => x.role === role).length > 1 && <Button type="button" variant="ghost" size="sm" className="mt-2 text-destructive" onClick={() => setV({ ...v, parties: v.parties.filter((_, j) => j !== i) })}>Remove this {role}</Button>}
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => setV({ ...v, parties: [...v.parties, { role, party_id: "", ...(legacy ? {} : { freight_amount: "" }), expenses: [] }] })}><Plus className="mr-1 h-4 w-4" />Add {role === "consignor" ? "Consignor" : "Consignee"}</Button>
    </div>
  );

  const firstConsignor = v.parties.find((p) => p.role === "consignor")?.party_id;
  const payer = v.freight_type === "paid" ? firstConsignor : v.freight_type === "to_pay" ? v.parties.find((p) => p.role === "consignee")?.party_id : v.billing_party_id || firstConsignor;
  const dp = v.direct_payment_enabled ? Math.min(Number(v.direct_payment_amount || 0), finalFreight) : 0;
  // Party-wise LR: the direct-payment credit goes to the first consignee that has freight, else the first party that has freight (same rule as the database).
  const dpIdx = (() => { const w = v.parties.map((p, i) => ({ p, i, n: pf[i] })).filter((x) => x.n != null && x.n > 0); return (w.find((x) => x.p.role === "consignee") ?? w[0])?.i ?? -1; })();
  const dpPartyName = dpIdx >= 0 ? parties.data?.find((x) => x.id === v.parties[dpIdx].party_id)?.name : undefined;
  const autoComm = v.direct_payment_enabled ? Math.max(0, r2(Number(v.direct_payment_amount || 0) - Number(v.freight_payable || 0))) : null;
  useEffect(() => {
    if (!commissionAuto || !v.commission_enabled || autoComm == null || autoComm <= 0) return;
    if (v.commission_mode === "fixed" && String(v.commission_value ?? "") === String(autoComm)) return;
    setV((p) => ({ ...p, commission_mode: "fixed", commission_value: String(autoComm) }));
  }, [commissionAuto, v.commission_enabled, v.commission_mode, v.commission_value, autoComm]);

  return (
    <div className="space-y-4">
      <Section n={1} title="LR details">
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="LR date" required><Input type="date" value={v.lr_date ?? ""} onChange={(e) => set("lr_date", e.target.value)} /></Field>
          <Field label="Vehicle number" hint={trip ? (trip.market_vehicle_number || (vehicles.data ?? []).find((x) => x.id === trip.vehicle_id)?.registration_number ? "This LR is on a trip, which already has its vehicle" : "Leave blank if not assigned yet") : "Pick an own vehicle or type an external truck number. Leave blank if not assigned yet"}>
            <Input list="lr-vehicle-options" value={v.vehicle_number ?? ""} onChange={(e) => set("vehicle_number", e.target.value.toUpperCase())} autoComplete="off" placeholder="Not assigned" />
            <datalist id="lr-vehicle-options">{(vehicles.data ?? []).filter((x) => x.is_active).map((x) => <option key={x.id} value={x.registration_number} />)}</datalist></Field>
          {trip && !isNew && <>
            <Field label="Loading stop"><select className={selectCls} value={v.loading_stop_id ?? ""} onChange={(e) => set("loading_stop_id", e.target.value)}><option value="">—</option>{stops.map((s: any) => <option key={s.id} value={s.id}>{s.location}</option>)}</select></Field>
            <Field label="Unloading stop"><select className={selectCls} value={v.unloading_stop_id ?? ""} onChange={(e) => set("unloading_stop_id", e.target.value)}><option value="">—</option>{stops.map((s: any) => <option key={s.id} value={s.id}>{s.location}</option>)}</select></Field>
          </>}
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2"><Field label="Total weight"><Input type="number" min="0" value={v.weight ?? ""} onChange={(e) => set("weight", e.target.value)} /></Field>
            <Field label="Unit"><select className={selectCls} value={v.weight_unit} onChange={(e) => set("weight_unit", e.target.value)}><option value="kg">kg</option><option value="quintal">quintal</option><option value="tonne">tonne</option><option value="unit">Unit</option></select></Field></div>
          <div className="sm:col-span-4"><Field label="Notes"><Textarea value={v.notes ?? ""} onChange={(e) => set("notes", e.target.value)} /></Field></div>
        </div>
      </Section>

      <Section n={2} title="Consignors (and their expenses)">{PartyBlock({ role: "consignor" })}</Section>
      <Section n={3} title="Consignees (and their expenses)">{PartyBlock({ role: "consignee" })}</Section>

      {legacy ? (
      <Section n={4} title="Customer freight">
        <p className="mb-3 text-xs text-muted-foreground">This LR was saved before party-wise freight, so its freight keeps the original single-party posting and is unchanged.</p>
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Rate unit"><select className={selectCls} value={v.rate_unit} onChange={(e) => set("rate_unit", e.target.value)}>{Object.entries(RATE_UNIT_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          <Field label={v.rate_unit === "fixed" ? "Fixed freight (₹)" : "Rate (₹)"} required><Input type="number" min="0" step="0.01" value={v.rate ?? ""} onChange={(e) => set("rate", e.target.value)} /></Field>
        </div>
        <div className="mt-4 space-y-2">
          <p className="text-sm font-medium">Additions (+) and deductions (−)</p>
          {v.adjustments.map((a, i) => (
            <div key={i} className="grid items-end gap-2 sm:grid-cols-6">
              <Field label="Type"><select className={selectCls} value={a.kind} onChange={(e) => setV({ ...v, adjustments: v.adjustments.map((x, j) => (j === i ? { ...x, kind: e.target.value as "add" } : x)) })}><option value="add">+ Addition</option><option value="deduct">− Deduction</option></select></Field>
              <Field label="Amount" required><Input type="number" min="0" value={a.amount} onChange={(e) => setV({ ...v, adjustments: v.adjustments.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)) })} /></Field>
              <div className="sm:col-span-3"><Field label="Reason" required><Input value={a.reason} onChange={(e) => setV({ ...v, adjustments: v.adjustments.map((x, j) => (j === i ? { ...x, reason: e.target.value } : x)) })} /></Field></div>
              <Button type="button" variant="ghost" size="icon" aria-label={`Remove adjustment ${i + 1}`} onClick={() => setV({ ...v, adjustments: v.adjustments.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setV({ ...v, adjustments: [...v.adjustments, { kind: "add", amount: "", reason: "" }] })}>+ Addition</Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setV({ ...v, adjustments: [...v.adjustments, { kind: "deduct", amount: "", reason: "" }] })}>− Deduction</Button>
          </div>
        </div>
        <div className="mt-4 rounded-md border border-info/30 bg-accent p-3 text-sm">
          <p className="font-medium">Calculation</p>
          <p>{v.rate_unit === "fixed" ? `Fixed freight ${formatINR(rate ?? 0)} (not multiplied by weight)` : `${weight ?? 0} ${v.weight_unit} = ${calc.kg} kg → ${calc.kg / ({ per_kg: 1, per_quintal: 100, per_tonne: 1000 } as any)[v.rate_unit]} ${v.rate_unit.replace("per_", "")} × ${formatINR(rate ?? 0)} = ${formatINR(calc.base)}`}</p>
          <p>Base {formatINR(calc.base)} + additions {formatINR(calc.additions)} − deductions {formatINR(calc.deductions)} = <b>{formatINR(calc.final)}</b></p>
          <p className="text-muted-foreground">Receivable from: {parties.data?.find((x) => x.id === payer)?.name ?? "(choose parties)"}</p>
        </div>
      </Section>
      ) : (
      <Section n={4} title="Customer freight (by consignor / consignee)">
        <div className="rounded-md border border-info/30 bg-accent p-3 text-sm">
          <p className="font-medium">LR customer freight</p>
          {v.parties.map((p, i) => pf[i] == null ? null : <p key={i}>{parties.data?.find((x) => x.id === p.party_id)?.name ?? "(choose party)"} <span className="text-muted-foreground">({p.role})</span>: {formatINR(Number.isFinite(pf[i]) ? (pf[i] as number) : 0)}</p>)}
          {!pf.some((n) => n != null) && <p className="text-muted-foreground">Enter the freight in the Freight (₹) box of the consignor and/or consignee who owes it. You can split it between several parties.</p>}
          <p className="mt-1">Total customer freight = <b>{formatINR(partyTotal)}</b></p>
          <p className="text-muted-foreground">Each amount is posted once to that party's ledger. Editing the LR updates the same entries.</p>
        </div>
      </Section>
      )}

      <Section n={5} title="Transporter / freight payable">
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Transporter" hint="Pick a party or type a new name to add it once">
            <TransporterSelect value={v.transporter_id} onChange={(x) => set("transporter_id", x)} /></Field>
          <Field label="Transporter rate unit" hint="Leave on Manual to type the amount yourself"><select className={selectCls} value={v.transporter_rate_unit ?? ""} onChange={(e) => setTP({ transporter_rate_unit: e.target.value })}><option value="">Manual (type amount)</option>{Object.entries(RATE_UNIT_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          {v.transporter_rate_unit && v.transporter_rate_unit !== "fixed" && <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2"><Field label="Weight for transporter" hint={weight ? `LR weight: ${weight} ${v.weight_unit}` : undefined}><Input type="number" min="0" value={v.transporter_weight ?? ""} onChange={(e) => setTP({ transporter_weight: e.target.value })} /></Field>
            <Field label="Unit"><select className={selectCls} value={v.transporter_weight_unit || "kg"} onChange={(e) => setTP({ transporter_weight_unit: e.target.value })}><option value="kg">kg</option><option value="quintal">quintal</option><option value="tonne">tonne</option><option value="unit">Unit</option></select></Field></div>}
          {v.transporter_rate_unit && <Field label={v.transporter_rate_unit === "fixed" ? "Fixed freight to transporter (₹)" : "Transporter rate (₹)"}><Input type="number" min="0" step="0.01" value={v.transporter_rate ?? ""} onChange={(e) => setTP({ transporter_rate: e.target.value })} /></Field>}
          <Field label="Add (+) to transporter freight (₹)" hint="Freight difference, commission etc."><Input type="number" min="0" step="0.01" value={v.transporter_additions ?? ""} onChange={(e) => setTAdj({ transporter_additions: e.target.value })} /></Field>
          <div className="sm:col-span-1"><Field label="Reason for add"><Input value={v.transporter_additions_reason ?? ""} onChange={(e) => set("transporter_additions_reason", e.target.value)} /></Field></div>
          <Field label="Shortage (−) from transporter freight (₹)" hint="Material shortage charges to cut"><Input type="number" min="0" step="0.01" value={v.transporter_shortage ?? ""} onChange={(e) => setTAdj({ transporter_shortage: e.target.value })} /></Field>
          <div className="sm:col-span-1"><Field label="Reason for shortage"><Input value={v.transporter_shortage_reason ?? ""} onChange={(e) => set("transporter_shortage_reason", e.target.value)} /></Field></div>
          <Field label="Freight payable to transporter (₹)" hint="Final amount after add / shortage. This does NOT record a payment"><Input type="number" min="0" value={v.freight_payable ?? ""} onChange={(e) => set("freight_payable", e.target.value)} /></Field>
        </div>
        {tCalc && <p className="mt-2 text-sm">{tUnit === "fixed" ? `Fixed freight to transporter ${formatINR(tRate ?? 0)} (not multiplied by weight)` : `${tWeight ?? 0} ${v.transporter_weight_unit || "kg"} × ${formatINR(tRate ?? 0)} ${RATE_UNIT_LABEL[tUnit as RateUnit].toLowerCase()} = ${formatINR(tCalc.base)}`}</p>}
        {(Number(v.transporter_additions || 0) > 0 || Number(v.transporter_shortage || 0) > 0) && <p className="mt-2 text-sm">Base {formatINR(r2(Number(v.freight_payable || 0) - Number(v.transporter_additions || 0) + Number(v.transporter_shortage || 0)))} + add {formatINR(Number(v.transporter_additions || 0))} − shortage {formatINR(Number(v.transporter_shortage || 0))} = <b>{formatINR(Number(v.freight_payable || 0))}</b></p>}
        <p className="mt-2 text-xs text-muted-foreground">Amount paid and remaining are calculated from real payments and advances (see Transporter Settlements).</p>
      </Section>

      <Section n={6} title="Direct payment & commission (optional)" defaultOpen={v.direct_payment_enabled || v.commission_enabled}>
        <div className="grid gap-4 sm:grid-cols-4">
          <label className="flex items-center gap-2 text-sm sm:col-span-2"><Switch checked={v.direct_payment_enabled} onCheckedChange={(c) => set("direct_payment_enabled", c)} />Consignee paid the driver directly?</label>
          {v.direct_payment_enabled && <Field label="Direct payment amount (₹)"><Input type="number" min="0" value={v.direct_payment_amount ?? ""} onChange={(e) => set("direct_payment_amount", e.target.value)} /></Field>}
          {v.direct_payment_enabled && <p className="text-xs text-muted-foreground sm:col-span-4">Not Gokul cash. Reduces the party's freight receivable by {formatINR(dp)} and the transporter payable by {formatINR(Math.min(dp, Number(v.freight_payable || 0)))}.{!legacy && dpPartyName ? ` Credited to ${dpPartyName}.` : ""}</p>}
          <label className="flex items-center gap-2 text-sm sm:col-span-4"><Switch checked={v.commission_enabled} onCheckedChange={(c) => set("commission_enabled", c)} />Commission applicable?</label>
          {v.commission_enabled && <>
            <Field label="Commission type"><select className={selectCls} value={v.commission_mode} onChange={(e) => { setCommissionAuto(false); set("commission_mode", e.target.value); }}><option value="percent">% of freight</option><option value="fixed">Fixed ₹</option></select></Field>
            <Field label={v.commission_mode === "percent" ? "Percent (%)" : "Amount (₹)"}><Input type="number" min="0" value={v.commission_value ?? ""} onChange={(e) => { setCommissionAuto(false); set("commission_value", e.target.value); }} /></Field>
            <Field label="Date"><Input type="date" value={v.commission_date ?? ""} onChange={(e) => set("commission_date", e.target.value)} /></Field>
            <Field label="Reference"><Input value={v.commission_reference ?? ""} onChange={(e) => set("commission_reference", e.target.value)} /></Field>
            <div className="sm:col-span-2"><Field label="Notes"><Input value={v.commission_notes ?? ""} onChange={(e) => set("commission_notes", e.target.value)} /></Field></div>
            {autoComm != null && autoComm > 0 && <p className="text-xs text-muted-foreground sm:col-span-4">{commissionAuto ? "Auto" : "Suggested"}: {formatINR(autoComm)} = direct payment {formatINR(Number(v.direct_payment_amount || 0))} − freight payable {formatINR(Number(v.freight_payable || 0))}. {!commissionAuto && <button type="button" className="text-info underline" onClick={() => setCommissionAuto(true)}>Use this amount</button>}</p>}
            <p className="text-sm sm:col-span-4">Commission due from transporter: <Money value={commission} /> · {transporters.data?.find((t) => t.id === (v.transporter_id || trip?.transporter_id))?.name || "Choose transporter"}</p>
          </>}
          {initial.commission_enabled && !v.commission_enabled && <Field label="Reason for turning commission off" required><Input value={v.commission_cancel_reason ?? ""} onChange={(e) => set("commission_cancel_reason", e.target.value)} /></Field>}
        </div>
      </Section>

      <Section n={7} title="Documents (optional)">
        {isNew ? <p className="text-sm text-muted-foreground">Save the LR first, then add documents (PDF or image) from this page or the LR details page.</p> : <LRDocuments lrId={initial.id as string} />}
      </Section>

      <Section n={8} title="Save">
        {err && <p role="alert" className="mb-3 rounded bg-destructive/10 p-2 text-sm text-destructive">{err}</p>}
        <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save LR"}</Button>
      </Section>
    </div>
  );
}
