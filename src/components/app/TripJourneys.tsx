import { Plus, Trash2, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useParties, useTransporters, nameOf } from "@/lib/lookups";
import { blankJourney, blankJourneyEntry, journeyTotals, type JourneyEntry } from "@/lib/trip-journeys";
import { todayIST, formatDate } from "@/lib/format";
import { PartyFreightFields } from "./PartyFreightFields";
import { SearchSelect } from "./SearchSelect";
import { TransporterSelect } from "./TransporterSelect";
import { Field, Money } from "./ui";

export function TripJourneys({ entries, setEntries }: { entries: JourneyEntry[]; setEntries: (rows: JourneyEntry[]) => void }) {
  const parties = useParties();
  const update = (id: string, patch: Partial<JourneyEntry>) => setEntries(entries.map(e => e.id === id ? { ...e, ...patch } : e));
  return <div className="space-y-6">
    {(["main", "return"] as const).filter(j => j === "main" || entries.some(e => e.journey === j)).map(journey => <div key={journey} className="space-y-4" aria-label={`${journey} journey`}>
      <h3 className="font-semibold">{journey === "main" ? "Main Journey" : "Return Journey"}</h3>
      {(["consignor", "consignee", "transporter"] as const).map(role => <div key={role} className="space-y-3">
        {entries.filter(e => e.journey === journey && e.role === role).map((e, i) => {
          const label = `${journey === "main" ? "Main" : "Return"} ${role} ${i + 1}`;
          return <div key={e.id} className={`space-y-3 rounded-md border p-3 ${e.cancel_reason ? "opacity-60" : ""}`}>
            <div className="flex items-center justify-between gap-2"><h4 className="font-medium capitalize">{role} {i + 1}</h4>
              <Button type="button" variant="ghost" size="sm" aria-label={`Remove ${label}`} onClick={() => {
                if (!e.saved) setEntries(entries.filter(x => x.id !== e.id));
                else { const reason = window.prompt("Reason for cancelling this journey entry:"); if (reason?.trim()) update(e.id, { cancel_reason: reason.trim() }); }
              }}>{e.saved ? <Ban className="h-4 w-4" /> : <Trash2 className="h-4 w-4" />}</Button></div>
            {e.cancel_reason ? <p className="text-sm text-destructive">Cancellation: {e.cancel_reason} <Button variant="ghost" size="sm" onClick={() => update(e.id, { cancel_reason: undefined })}>Undo</Button></p> : <>
              <Field label={role === "transporter" ? "Transporter" : role === "consignor" ? "Consignor" : "Consignee"}>
                {role === "transporter" ? <TransporterSelect value={e.transporter_id} onChange={id => update(e.id, { transporter_id: id })} /> : <SearchSelect value={e.party_id} onChange={id => update(e.id, { party_id: id })} options={(parties.data ?? []).filter(p => p.is_active || p.id === e.party_id).map(p => ({ value: p.id, label: p.name }))} />}
              </Field>
              <PartyFreightFields label={label} values={e} onChange={p => update(e.id, p)} />
              {role === "transporter" && <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Shortage reason (optional)"><Input aria-label={`${label} Shortage reason`} value={e.shortage_reason ?? ""} onChange={ev => update(e.id, { shortage_reason: ev.target.value })} /></Field>
                <Field label="Addition reason (optional)"><Input aria-label={`${label} Addition reason`} value={e.addition_reason ?? ""} onChange={ev => update(e.id, { addition_reason: ev.target.value })} /></Field>
              </div>}
              {role === "transporter" && <p className="text-sm text-success">Freight receivable from transporter</p>}
              {role === "consignor" && <>
                <div className="grid gap-3 sm:grid-cols-3">{(["goods_description", "loading_point", "delivery_point"] as const).map(k => <Field key={k} label={k === "goods_description" ? "Goods" : k === "loading_point" ? "Loading point" : "Delivery point"}><Input aria-label={`${label} ${k}`} value={e[k]} onChange={ev => update(e.id, { [k]: ev.target.value })} /></Field>)}</div>
                <h5 className="text-sm font-medium">Consignor expenses / payable</h5>
                {e.expenses.map((x, k) => <div key={x.id} className="grid items-end gap-2 sm:grid-cols-4">
                  {(["category", "amount", "expense_date", "notes"] as const).map(f => <Field key={f} label={f === "expense_date" ? "Date" : f === "amount" ? "Payable (₹)" : f === "category" ? "Category" : "Notes"}><Input aria-label={`${label} expense ${k + 1} ${f}`} type={f === "expense_date" ? "date" : f === "amount" ? "number" : "text"} value={x[f]} onChange={ev => update(e.id, { expenses: e.expenses.map(y => y.id === x.id ? { ...y, [f]: ev.target.value } : y) })} /></Field>)}
                </div>)}
                <Button variant="outline" size="sm" onClick={() => update(e.id, { expenses: [...e.expenses, { id: crypto.randomUUID(), category: "Loading", amount: "", expense_date: todayIST(), notes: "" }] })}><Plus className="mr-1 h-4 w-4" />Add consignor expense</Button>
              </>}
            </>}
          </div>;
        })}
        <Button variant="outline" size="sm" onClick={() => setEntries([...entries, blankJourneyEntry(journey, role)])}><Plus className="mr-1 h-4 w-4" />Add {role}</Button>
      </div>)}
    </div>)}
    {!entries.some(e => e.journey === "return") && <Button variant="outline" onClick={() => setEntries([...entries, ...blankJourney("return")])}><Plus className="mr-1 h-4 w-4" />Add Return Journey</Button>}
  </div>;
}

export function TripJourneyDetails({ entries }: { entries: any[] }) {
  const parties = useParties(); const transporters = useTransporters();
  return <div className="space-y-5">{(["main", "return"] as const).map(j => {
    const rows = entries.filter(e => e.journey === j); if (!rows.length) return null;
    const totals = journeyTotals(rows);
    return <div key={j} className="space-y-3"><h3 className="font-semibold">{j === "main" ? "Main Journey" : "Return Journey"}</h3>
      {rows.map(e => <div key={e.id} className={`border-b pb-3 text-sm ${e.is_cancelled ? "opacity-50" : ""}`}><p className="font-medium capitalize">{e.role}: {nameOf(e.role === "transporter" ? transporters.data : parties.data, e.transporter_id || e.party_id)} · {formatDate(e.freight_date)} {e.is_cancelled && `· Cancelled: ${e.cancel_reason}`}</p>
        <p>{e.goods_description} {[e.loading_point, e.delivery_point].filter(Boolean).join(" → ")}</p>
        <p>Weight: {e.weight ?? "—"} kg · Rate: <Money value={e.rate} /> · Freight: <Money value={e.freight_amount} /> · Shortage: <Money value={e.shortage} /> · Addition: <Money value={e.addition} /></p>
        {e.shortage_reason && <p>Shortage reason: {e.shortage_reason}</p>}{e.addition_reason && <p>Addition reason: {e.addition_reason}</p>}
        {(e.expenses ?? []).map((x: any) => <p key={x.id}>Consignor payable: {x.category} · <Money value={x.amount} /> · {formatDate(x.expense_date)} · {x.notes}</p>)}
      </div>)}
      <p className="text-sm">Party freight: <Money value={totals.partyFreight} /> · Transporter receivable: <Money value={totals.transporterReceivable} /> · Consignor payable: <Money value={totals.consignorPayable} /></p>
    </div>;
  })}</div>;
}