import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, Money } from "./ui";
import { selectCls } from "./Section";
import { SearchSelect } from "./SearchSelect";
import { ErrorState, LoadingState } from "./states";
import { createPartyInline, useParties } from "@/lib/lookups";
import { blankTripLr, tripLrFreightTotal, type TripLrDraft, type TripLrParty } from "@/lib/trip-lrs";
import { formatDate } from "@/lib/format";
import { PartyFreightFields } from "./PartyFreightFields";
import { TransporterSelect } from "./TransporterSelect";

/**
 * Consignor, consignee and LR / Bilty details inside the Trip form.
 * - LRs already linked to this trip are listed (open one to edit it in the full LR form).
 * - An existing unlinked LR can be linked to this trip (done when the trip is saved).
 * - New LR rows are saved through the existing save_lr() with this trip, so freight/payable post once, from the LR.
 * Vehicle, transporter and driver stay in the "Vehicle, transporter & driver" section above and are used by these LRs.
 */
export function TripLrSection({ tripId, drafts, setDrafts, linkIds, setLinkIds, transporterName, vehicleLabel }: {
  tripId?: string; drafts: TripLrDraft[]; setDrafts: (d: TripLrDraft[]) => void; linkIds: string[]; setLinkIds: (ids: string[]) => void;
  transporterName: string; vehicleLabel: string;
}) {
  const qc = useQueryClient();
  const parties = useParties();
  const linked = useQuery({
    queryKey: ["trip-form-lrs", tripId],
    enabled: !!tripId,
    queryFn: async () => {
      if (!tripId) return [];
      const { data, error } = await supabase.from("lrs").select("id, lr_number, lr_date, transporter_id, transporters(name), status, final_freight, freight_payable, transporter_freight_direction, lr_parties(role, seq, parties(name))").eq("trip_id", tripId).order("lr_number");
      if (error) throw error;
      return data as any[];
    },
  });
  const unlinked = useQuery({
    queryKey: ["lrs-unlinked"],
    queryFn: async () => {
      const { data, error } = await supabase.from("lrs").select("id, lr_number, lr_date").is("trip_id", null).eq("status", "active").order("lr_number");
      if (error) throw error;
      return data;
    },
  });
  const partyOpts = (parties.data ?? []).filter((p) => p.is_active).map((p) => ({ value: p.id, label: p.name }));
  const createParty = async (name: string) => { const id = await createPartyInline(name, "customer"); await qc.invalidateQueries({ queryKey: ["parties"] }); return id; };
  const upd = (i: number, patch: Partial<TripLrDraft>) => setDrafts(drafts.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  const updParty = (i: number, side: "consignors" | "consignees", k: number, patch: Partial<TripLrParty>) =>
    upd(i, { [side]: drafts[i][side].map((p, j) => (j === k ? { ...p, ...patch } : p)) } as Partial<TripLrDraft>);
  const names = (l: any, role: string) => (l.lr_parties ?? []).filter((p: any) => p.role === role).sort((a: any, b: any) => a.seq - b.seq).map((p: any) => p.parties?.name).filter(Boolean).join(", ") || "—";

  const PartyRows = ({ i, side }: { i: number; side: "consignors" | "consignees" }) => (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">{side === "consignors" ? "Consignor" : "Consignee"}</h3>
      {drafts[i][side].map((p, k) => (
        <div key={k} className="grid items-end gap-2 sm:grid-cols-12">
          <div className="sm:col-span-6"><Field label={side === "consignors" ? (k === 0 ? "Consignor" : `Consignor ${k + 1}`) : (k === 0 ? "Consignee" : `Consignee ${k + 1}`)} required>
            <SearchSelect value={p.party_id} onChange={(x) => updParty(i, side, k, { party_id: x })} options={partyOpts} placeholder="Choose or type new" allowClear={false} onCreate={createParty} createLabel="Create party" /></Field></div>
          <div className="flex justify-end sm:col-span-2">
            <Button type="button" variant="ghost" size="icon" disabled={drafts[i][side].length <= 1} aria-label={`Remove ${side === "consignors" ? "consignor" : "consignee"} row`}
              onClick={() => upd(i, { [side]: drafts[i][side].filter((_, j) => j !== k) } as Partial<TripLrDraft>)}><Trash2 className="h-4 w-4" /></Button>
          </div>
          <div className="sm:col-span-12"><PartyFreightFields label={`${side === "consignors" ? "Consignor" : "Consignee"} ${k + 1}`} values={p} onChange={(patch) => updParty(i, side, k, patch)} /></div>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => upd(i, { [side]: [...drafts[i][side], { party_id: "", freight_amount: "" }] } as Partial<TripLrDraft>)}>
        <Plus className="mr-1 h-4 w-4" />Add {side === "consignors" ? "consignor" : "consignee"}</Button>
    </div>
  );

  return (
    <div className="space-y-5">
      <dl className="grid gap-2 rounded-md border bg-muted/40 p-3 text-sm sm:grid-cols-2">
        <div><dt className="text-muted-foreground">Transporter</dt><dd>{transporterName || "Not chosen"}</dd></div>
        <div><dt className="text-muted-foreground">Vehicle number</dt><dd>{vehicleLabel || "Not chosen"}</dd></div>
      </dl>

      {tripId && (
        <div className="space-y-2">
          <p className="text-sm font-medium">LR / Bilties already on this trip</p>
          {linked.isPending ? <LoadingState /> : linked.isError ? <ErrorState error={linked.error} onRetry={() => linked.refetch()} /> : linked.data.length === 0 ? <p className="text-sm text-muted-foreground">None yet.</p> : (
            <div className="overflow-x-auto rounded border"><table className="w-full text-sm">
              <thead><tr className="border-b bg-muted/40 text-left"><th className="p-2">LR / Bilty</th><th className="p-2">Date</th><th className="p-2">Transporter</th><th className="p-2">Consignor(s)</th><th className="p-2">Consignee(s)</th><th className="p-2 text-right">Freight</th><th className="p-2 text-right">Transporter freight</th><th className="p-2" /></tr></thead>
              <tbody>{linked.data.map((l) => (
                <tr key={l.id} className={`border-b last:border-0 ${l.status === "cancelled" ? "opacity-50" : ""}`}>
                  <td className="p-2 font-medium">{l.lr_number}</td><td className="p-2 whitespace-nowrap">{formatDate(l.lr_date)}</td><td className="p-2">{l.transporters?.name || "—"}</td>
                  <td className="p-2">{names(l, "consignor")}</td><td className="p-2">{names(l, "consignee")}</td>
                  <td className="p-2 text-right"><Money value={l.final_freight} /></td><td className="p-2 text-right"><Money value={l.freight_payable} /> {l.transporter_freight_direction === "receivable" ? "Receivable" : "Payable"}</td>
                  <td className="p-2"><Link to="/lr/$id/edit" params={{ id: l.id }} className="text-info hover:underline">Edit LR</Link></td>
                </tr>))}</tbody>
            </table></div>
          )}
          <p className="text-xs text-muted-foreground">Existing LRs are edited in the LR form so their amounts are never changed from here by accident.</p>
        </div>
      )}

      <div className="space-y-2">
        <p className="text-sm font-medium">Link an existing LR / Bilty to this trip</p>
        <div className="flex flex-wrap items-end gap-2">
          <select aria-label="Link an existing LR" className={selectCls + " max-w-64"} value="" onChange={(e) => { if (e.target.value && !linkIds.includes(e.target.value)) setLinkIds([...linkIds, e.target.value]); }}>
            <option value="">Choose an unlinked LR…</option>
            {(unlinked.data ?? []).filter((l) => !linkIds.includes(l.id)).map((l) => <option key={l.id} value={l.id}>{l.lr_number} ({formatDate(l.lr_date)})</option>)}
          </select>
          {linkIds.map((id) => { const l = unlinked.data?.find((x) => x.id === id); return (
            <span key={id} className="inline-flex items-center gap-1 rounded-full border bg-card px-2 py-1 text-xs">{l?.lr_number ?? id}
              <button type="button" aria-label={`Do not link ${l?.lr_number ?? "this LR"}`} onClick={() => setLinkIds(linkIds.filter((x) => x !== id))}><X className="h-3 w-3" /></button></span>); })}
        </div>
        {unlinked.isError && <p role="alert" className="text-sm text-destructive">Could not load unlinked LRs: {(unlinked.error as Error).message}</p>}
        {linkIds.length > 0 && <p className="text-xs text-muted-foreground">Linked when you save the trip. The LR keeps its own amounts.</p>}
      </div>

      <div className="space-y-3">
        <p className="text-sm font-medium">New LR / Bilty entered here</p>
        {drafts.map((d, i) => (
          <div key={d.key} className="space-y-3 rounded-md border p-3">
            <div className="flex items-center justify-between"><p className="text-sm font-semibold">{d.savedId ? `LR / Bilty ${i + 1} (saved)` : `LR / Bilty ${i + 1}`}</p>
              {!d.savedId && <Button type="button" variant="ghost" size="sm" onClick={() => setDrafts(drafts.filter((_, j) => j !== i))}><Trash2 className="mr-1 h-4 w-4" />Remove</Button>}</div>
            {d.savedId && <p className="rounded bg-success/10 p-2 text-xs">This LR is already saved. Saving the trip again updates it; it will not be created twice.</p>}
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="LR / Bilty number" hint="Leave blank to number it automatically"><Input value={d.lr_number} onChange={(e) => upd(i, { lr_number: e.target.value })} /></Field>
              <Field label="Goods"><Input value={d.goods_description} onChange={(e) => upd(i, { goods_description: e.target.value })} /></Field>
              <Field label="Loading point"><Input value={d.loading_point} onChange={(e) => upd(i, { loading_point: e.target.value })} /></Field>
              <Field label="Delivery point"><Input value={d.delivery_point} onChange={(e) => upd(i, { delivery_point: e.target.value })} /></Field>
            </div>
            {PartyRows({ i, side: "consignors" })}
            {PartyRows({ i, side: "consignees" })}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Transporter for LR / Bilty {i + 1}</h3>
              <Field label="Transporter" hint={d.transporter_id ? "Only this LR / Bilty uses this transporter" : `Blank = trip transporter (${transporterName || "not chosen"})`}>
                <TransporterSelect value={d.transporter_id ?? ""} onChange={(x) => upd(i, { transporter_id: x })} />
              </Field>
              <Field label="Transporter freight direction"><select className={selectCls} value={d.transporter_freight_direction || "payable"} onChange={e => upd(i, { transporter_freight_direction: e.target.value as "payable" | "receivable" })}><option value="payable">Payable — Gokul owes transporter</option><option value="receivable">Receivable — transporter owes Gokul</option></select></Field>
              {Number(d.transporter_shortage) > 0 && <Field label="Reason for transporter shortage" required><Input value={d.transporter_shortage_reason ?? ""} onChange={(e) => upd(i, { transporter_shortage_reason: e.target.value })} /></Field>}
              {Number(d.transporter_additions) > 0 && <Field label="Reason for transporter addition" required><Input value={d.transporter_additions_reason ?? ""} onChange={(e) => upd(i, { transporter_additions_reason: e.target.value })} /></Field>}
              <PartyFreightFields label="Transporter" values={{ weight: d.transporter_weight, rate: d.transporter_rate, freight_amount: d.freight_payable, shortage: d.transporter_shortage, addition: d.transporter_additions, freight_date: d.transporter_freight_date }} onChange={(p) => upd(i, { ...(p.weight !== undefined ? { transporter_weight: p.weight } : {}), ...(p.rate !== undefined ? { transporter_rate: p.rate } : {}), ...(p.freight_amount !== undefined ? { freight_payable: p.freight_amount } : {}), ...(p.shortage !== undefined ? { transporter_shortage: p.shortage } : {}), ...(p.addition !== undefined ? { transporter_additions: p.addition } : {}), ...(p.freight_date !== undefined ? { transporter_freight_date: p.freight_date } : {}) })} />
            </div>
            <p className="text-sm">LR freight (sum of the party freights): <b><Money value={tripLrFreightTotal(d)} /></b></p>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => setDrafts([...drafts, blankTripLr()])}><Plus className="mr-1 h-4 w-4" />Add LR / Bilty</Button>
      </div>
    </div>
  );
}
