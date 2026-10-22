import { useState } from "react";
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
import { useParties, useDrivers, createPartyInline, EXPENSE_CATEGORIES, PAY_MODES, FREIGHT_TYPE } from "@/lib/lookups";
import { TransporterSelect } from "./TransporterSelect";
import { calcFreight, validateFreight, RATE_UNIT_LABEL, type RateUnit, type WeightUnit } from "@/lib/freight";
import { formatINR, todayIST } from "@/lib/format";

type Exp = Record<string, any>;
type LP = { id?: string; role: "consignor" | "consignee"; party_id: string; goods_description?: string; quantity?: string; weight?: string; loading_point?: string; delivery_point?: string; expenses: Exp[] };
export type LRValues = Record<string, any> & { parties: LP[]; adjustments: { id?: string; kind: "add" | "deduct"; amount: string; reason: string }[] };

export function blankLR(tripId?: string): LRValues {
  return {
    lr_date: todayIST(), trip_id: tripId ?? "", weight_unit: "kg", rate_unit: "fixed", freight_type: "to_pay", delivery_status: "pending",
    freight_payable: "0", direct_payment_enabled: false, commission_enabled: false, commission_mode: "percent", commission_status: "pending",
    parties: [{ role: "consignor", party_id: "", expenses: [] }, { role: "consignee", party_id: "", expenses: [] }], adjustments: [],
  };
}

export function LRForm({ initial }: { initial: LRValues }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const parties = useParties(); const drivers = useDrivers();
  const trips = useQuery({
    queryKey: ["trips-pick"],
    queryFn: async () => {
      const { data, error } = await supabase.from("trips").select("id, trip_number, trip_date, status, transporter_id, market_vehicle_number, driver_id, driver_name, trip_stops(id, location, seq)").neq("status", "cancelled").order("trip_date", { ascending: false }).limit(300);
      if (error) throw error;
      return data;
    },
  });
  const [v, setV] = useState<LRValues>(initial);
  const isNew = !initial.id;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: string, val: unknown) => setV((p) => ({ ...p, [k]: val }));
  const setP = (i: number, patch: Partial<LP>) => setV((p) => ({ ...p, parties: p.parties.map((x, j) => (j === i ? { ...x, ...patch } : x)) }));
  const setE = (i: number, k: number, patch: Exp) => setP(i, { expenses: v.parties[i].expenses.map((e, j) => (j === k ? { ...e, ...patch } : e)) });

  const trip = trips.data?.find((t) => t.id === v.trip_id);
  const stops = trip ? [...trip.trip_stops].sort((a: any, b: any) => a.seq - b.seq) : [];
  const adj = v.adjustments.map((a) => ({ ...a, amount: Number(a.amount) }));
  const weight = v.weight === "" || v.weight == null ? null : Number(v.weight);
  const rate = v.rate === "" || v.rate == null ? null : Number(v.rate);
  const calc = calcFreight(weight, v.weight_unit as WeightUnit, rate, v.rate_unit as RateUnit, adj);
  const commission = !v.commission_enabled ? 0 : v.commission_mode === "percent" ? Math.round(calc.final * Number(v.commission_value || 0)) / 100 : Number(v.commission_value || 0);
  const partyOpts = (role: string) => (parties.data ?? []).filter((p) => p.is_active).map((p) => ({ value: p.id, label: p.name, hint: (p.roles ?? []).includes(role) ? "" : (p.roles ?? []).join(", ") }));
  const createParty = async (name: string, role: string) => { const id = await createPartyInline(name, "customer"); await qc.invalidateQueries({ queryKey: ["parties"] }); void role; return id; };

  async function save() {
    if (busy) return;
    setErr(null);
    const fe = validateFreight(weight, rate, v.rate_unit as RateUnit, adj);
    if (fe) return setErr(fe);
    if (!v.parties.some((p) => p.role === "consignor" && p.party_id) || !v.parties.some((p) => p.role === "consignee" && p.party_id)) return setErr("Add at least one consignor and one consignee");
    if (v.parties.some((p) => !p.party_id)) return setErr("Choose a party for every consignor/consignee row (or remove the empty row)");
    if (Number(v.freight_payable) < 0) return setErr("Freight payable cannot be negative");
    if (v.direct_payment_enabled && !(Number(v.direct_payment_amount) > 0)) return setErr("Enter the amount the consignee paid the driver directly");
    if (v.commission_enabled && !v.driver_id && !v.driver_name?.trim() && !trip?.driver_id && !trip?.driver_name) return setErr("Choose or type the driver who owes the commission");
    if (initial.commission_enabled && !v.commission_enabled && !v.commission_cancel_reason?.trim()) return setErr("Enter a reason for turning commission off");
    for (const p of v.parties) for (const e of p.expenses) if (!(Number(e.amount) > 0)) return setErr("Every consignor/consignee expense needs an amount");
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("save_lr", { p: v as never });
      if (error) throw error;
      toast.success("LR saved");
      qc.invalidateQueries();
      nav({ to: "/lr/$id", params: { id: data as string } });
    } catch (e) {
      const m = errorMessage(e);
      setErr(/lrs_business_id_lr_number_key|duplicate/i.test(m) ? "Could not get a new LR number. Please try saving again." : m);
    } finally { setBusy(false); }
  }

  const PartyBlock = ({ role }: { role: "consignor" | "consignee" }) => (
    <div className="space-y-3">
      {v.parties.map((p, i) => p.role !== role ? null : (
        <div key={i} className="rounded-md border p-3">
          <div className="grid gap-3 sm:grid-cols-6">
            <div className="sm:col-span-2"><Field label={role === "consignor" ? "Consignor" : "Consignee"} required>
              <SearchSelect value={p.party_id} onChange={(x) => setP(i, { party_id: x })} options={partyOpts("customer")} placeholder="Choose or type new" allowClear={false}
                onCreate={(t) => createParty(t, role)} createLabel="Create party" /></Field></div>
            <div className="sm:col-span-2"><Field label="Goods"><Input value={p.goods_description ?? ""} onChange={(e) => setP(i, { goods_description: e.target.value })} /></Field></div>
            <Field label="Qty"><Input type="number" min="0" value={p.quantity ?? ""} onChange={(e) => setP(i, { quantity: e.target.value })} /></Field>
            <Field label={`Weight (${v.weight_unit})`}><Input type="number" min="0" value={p.weight ?? ""} onChange={(e) => setP(i, { weight: e.target.value })} /></Field>
            <div className="sm:col-span-3"><Field label="Loading point"><Input value={p.loading_point ?? ""} onChange={(e) => setP(i, { loading_point: e.target.value })} /></Field></div>
            <div className="sm:col-span-3"><Field label="Delivery point"><Input value={p.delivery_point ?? ""} onChange={(e) => setP(i, { delivery_point: e.target.value })} /></Field></div>
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
      <Button type="button" variant="outline" size="sm" onClick={() => setV({ ...v, parties: [...v.parties, { role, party_id: "", expenses: [] }] })}><Plus className="mr-1 h-4 w-4" />Add {role === "consignor" ? "Consignor" : "Consignee"}</Button>
    </div>
  );

  const firstConsignor = v.parties.find((p) => p.role === "consignor")?.party_id;
  const payer = v.freight_type === "paid" ? firstConsignor : v.freight_type === "to_pay" ? v.parties.find((p) => p.role === "consignee")?.party_id : v.billing_party_id || firstConsignor;
  const dp = v.direct_payment_enabled ? Math.min(Number(v.direct_payment_amount || 0), calc.final) : 0;

  return (
    <div className="space-y-4">
      <Section n={1} title="LR details">
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="LR date" required><Input type="date" value={v.lr_date ?? ""} onChange={(e) => set("lr_date", e.target.value)} /></Field>
          {trip && !isNew && <>
            <Field label="Loading stop"><select className={selectCls} value={v.loading_stop_id ?? ""} onChange={(e) => set("loading_stop_id", e.target.value)}><option value="">—</option>{stops.map((s: any) => <option key={s.id} value={s.id}>{s.location}</option>)}</select></Field>
            <Field label="Unloading stop"><select className={selectCls} value={v.unloading_stop_id ?? ""} onChange={(e) => set("unloading_stop_id", e.target.value)}><option value="">—</option>{stops.map((s: any) => <option key={s.id} value={s.id}>{s.location}</option>)}</select></Field>
          </>}
          <div className="sm:col-span-2"><Field label="Goods description"><Input value={v.goods_description ?? ""} onChange={(e) => set("goods_description", e.target.value)} /></Field></div>
          <Field label="Quantity"><Input type="number" min="0" value={v.quantity ?? ""} onChange={(e) => set("quantity", e.target.value)} /></Field>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2"><Field label="Total weight"><Input type="number" min="0" value={v.weight ?? ""} onChange={(e) => set("weight", e.target.value)} /></Field>
            <Field label="Unit"><select className={selectCls} value={v.weight_unit} onChange={(e) => set("weight_unit", e.target.value)}><option value="kg">kg</option><option value="quintal">quintal</option><option value="tonne">tonne</option></select></Field></div>
          <div className="sm:col-span-2"><Field label="Loading point(s)"><Input value={v.loading_point ?? ""} onChange={(e) => set("loading_point", e.target.value)} /></Field></div>
          <div className="sm:col-span-2"><Field label="Delivery point(s)"><Input value={v.delivery_point ?? ""} onChange={(e) => set("delivery_point", e.target.value)} /></Field></div>
          <div className="sm:col-span-4"><Field label="Notes"><Textarea value={v.notes ?? ""} onChange={(e) => set("notes", e.target.value)} /></Field></div>
        </div>
      </Section>

      <Section n={2} title="Consignors (and their expenses)">{PartyBlock({ role: "consignor" })}</Section>
      <Section n={3} title="Consignees (and their expenses)">{PartyBlock({ role: "consignee" })}</Section>

      <Section n={4} title="Customer freight">
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Freight type"><select className={selectCls} value={v.freight_type} onChange={(e) => set("freight_type", e.target.value)}>{Object.entries(FREIGHT_TYPE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          {v.freight_type === "tbb" && <Field label="Party to be billed"><select className={selectCls} value={v.billing_party_id ?? ""} onChange={(e) => set("billing_party_id", e.target.value)}><option value="">First consignor (default)</option>{v.parties.filter((p) => p.party_id).map((p, i) => <option key={i} value={p.party_id}>{parties.data?.find((x) => x.id === p.party_id)?.name} ({p.role})</option>)}</select></Field>}
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

      <Section n={5} title="Transporter / freight payable">
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Transporter" hint="Pick a party or type a new name to add it once">
            <TransporterSelect value={v.transporter_id} onChange={(x) => set("transporter_id", x)} /></Field>
          <Field label="Vehicle number"><Input value={v.vehicle_number ?? ""} onChange={(e) => set("vehicle_number", e.target.value)} /></Field>
          <Field label="Vehicle name/type"><Input value={v.vehicle_type ?? ""} onChange={(e) => set("vehicle_type", e.target.value)} /></Field>
          <Field label="Registered driver"><SearchSelect value={v.driver_id ?? ""} onChange={(id) => setV({ ...v, driver_id: id, driver_name: drivers.data?.find((d) => d.id === id)?.name ?? "" })} options={(drivers.data ?? []).map((d) => ({ value: d.id, label: d.name }))} placeholder="Choose driver" /></Field>
          {!v.driver_id && <Field label="Driver name"><Input aria-label="Driver name" value={v.driver_name ?? ""} onChange={(e) => set("driver_name", e.target.value)} placeholder={trip?.driver_name ?? "Type driver name"} /></Field>}
          <Field label="Freight payable to transporter (₹)" hint="This does NOT record a payment"><Input type="number" min="0" value={v.freight_payable ?? ""} onChange={(e) => set("freight_payable", e.target.value)} /></Field>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Amount paid and remaining are calculated from real payments and advances (see Transporter Settlements).</p>
      </Section>

      <Section n={6} title="Direct payment & commission (optional)" defaultOpen={v.direct_payment_enabled || v.commission_enabled}>
        <div className="grid gap-4 sm:grid-cols-4">
          <label className="flex items-center gap-2 text-sm sm:col-span-2"><Switch checked={v.direct_payment_enabled} onCheckedChange={(c) => set("direct_payment_enabled", c)} />Consignee paid the driver directly?</label>
          {v.direct_payment_enabled && <Field label="Direct payment amount (₹)"><Input type="number" min="0" value={v.direct_payment_amount ?? ""} onChange={(e) => set("direct_payment_amount", e.target.value)} /></Field>}
          {v.direct_payment_enabled && <p className="text-xs text-muted-foreground sm:col-span-4">Not Gokul cash. Reduces the party's freight receivable by {formatINR(dp)} and the transporter payable by {formatINR(Math.min(dp, Number(v.freight_payable || 0)))}.</p>}
          <label className="flex items-center gap-2 text-sm sm:col-span-4"><Switch checked={v.commission_enabled} onCheckedChange={(c) => set("commission_enabled", c)} />Commission applicable?</label>
          {v.commission_enabled && <>
            <Field label="Commission type"><select className={selectCls} value={v.commission_mode} onChange={(e) => set("commission_mode", e.target.value)}><option value="percent">% of freight</option><option value="fixed">Fixed ₹</option></select></Field>
            <Field label={v.commission_mode === "percent" ? "Percent (%)" : "Amount (₹)"}><Input type="number" min="0" value={v.commission_value ?? ""} onChange={(e) => set("commission_value", e.target.value)} /></Field>
            <Field label="Date"><Input type="date" value={v.commission_date ?? ""} onChange={(e) => set("commission_date", e.target.value)} /></Field>
            <Field label="Reference"><Input value={v.commission_reference ?? ""} onChange={(e) => set("commission_reference", e.target.value)} /></Field>
            <div className="sm:col-span-2"><Field label="Notes"><Input value={v.commission_notes ?? ""} onChange={(e) => set("commission_notes", e.target.value)} /></Field></div>
            <p className="text-sm sm:col-span-4">Commission due from driver: <Money value={commission} /> · {v.driver_name || drivers.data?.find((d) => d.id === (v.driver_id || trip?.driver_id))?.name || trip?.driver_name || "Choose driver"}</p>
          </>}
          {initial.commission_enabled && !v.commission_enabled && <Field label="Reason for turning commission off" required><Input value={v.commission_cancel_reason ?? ""} onChange={(e) => set("commission_cancel_reason", e.target.value)} /></Field>}
        </div>
      </Section>

      <Section n={7} title="Save">
        {err && <p role="alert" className="mb-3 rounded bg-destructive/10 p-2 text-sm text-destructive">{err}</p>}
        <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save LR"}</Button>
      </Section>
    </div>
  );
}
