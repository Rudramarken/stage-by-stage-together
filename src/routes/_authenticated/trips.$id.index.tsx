import { pageHead } from "@/lib/page-head";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Pencil, Plus, Link2, Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, StatusBadge, Money } from "@/components/app/ui";
import { LoadingState, ErrorState, errorMessage } from "@/components/app/states";
import { Section, selectCls } from "@/components/app/Section";
import { TripExpenses, TripAdvances } from "@/components/app/MoneyEditors";
import { CommissionPanel } from "@/components/app/CommissionPanel";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useDrivers, useTransporters, useVehicles, nameOf, TRIP_STATUS, LR_DELIVERY, FREIGHT_TYPE } from "@/lib/lookups";
import { formatDate, formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/trips/$id/")({
  head: () => pageHead("Trip details — Gokul Cargo Movers", "Trip details records for Gokul Cargo Movers transport management."),
  component: TripDetail,
});

type LegData = { trip: any; lrs: any[]; expenses: any[]; advances: any[]; commissions: any[] };

async function loadFamily(id: string) {
  const { data: t, error } = await supabase.from("trips").select("id, parent_trip_id").eq("id", id).single();
  if (error) throw error;
  const root = t.parent_trip_id ?? t.id;
  const { data: trips, error: e2 } = await supabase.from("trips").select("*, trip_stops(*)").or(`id.eq.${root},parent_trip_id.eq.${root}`).order("created_at");
  if (e2) throw e2;
  const ids = trips.map((x) => x.id);
  const [lrs, exps, advs] = await Promise.all([
    supabase.from("lrs").select("*, lr_parties(*, parties(name))").in("trip_id", ids).order("lr_number"),
    supabase.from("expenses").select("*").in("trip_id", ids).eq("is_cancelled", false),
    supabase.from("advances").select("*").in("trip_id", ids).eq("is_cancelled", false),
  ]);
  for (const r of [lrs, exps, advs]) if (r.error) throw r.error;
  // expenses attached to LRs of these trips (consignor/consignee), fetched by lr_id too
  const lrIds = (lrs.data ?? []).map((l) => l.id);
  const lrExp = lrIds.length ? await supabase.from("expenses").select("*").in("lr_id", lrIds).eq("is_cancelled", false) : { data: [], error: null };
  if (lrExp.error) throw lrExp.error;
  const { data: commissions, error: ce } = await supabase.from("commission_balances").select("*");
  if (ce) throw ce;
  const allExp = new Map<string, any>();
  for (const e of [...(exps.data ?? []), ...(lrExp.data ?? [])]) allExp.set(e.id, e); // one record, counted once
  const legs: LegData[] = trips.map((tr) => {
    const legLrs = (lrs.data ?? []).filter((l) => l.trip_id === tr.id);
    const legLrIds = new Set(legLrs.map((l) => l.id));
    return {
      trip: { ...tr, trip_stops: [...tr.trip_stops].sort((a: any, b: any) => a.seq - b.seq) },
      lrs: legLrs,
      expenses: [...allExp.values()].filter((e) => (e.scope === "trip" && e.trip_id === tr.id) || (e.lr_id && legLrIds.has(e.lr_id))),
      advances: (advs.data ?? []).filter((a) => a.trip_id === tr.id),
      commissions: (commissions ?? []).filter((c) => c.trip_id === tr.id || (c.lr_id && legLrIds.has(c.lr_id))),
    };
  });
  return { root, legs };
}

function summarize(legs: LegData[]) {
  const active = legs.flatMap((l) => l.lrs.filter((x) => x.status !== "cancelled"));
  const sum = (a: any[], f: (x: any) => number) => a.reduce((s, x) => s + f(x), 0);
  const exp = legs.flatMap((l) => l.expenses);
  const adv = legs.flatMap((l) => l.advances);
  return {
    freightReceivable: sum(active, (x) => Number(x.final_freight)),
    directPaid: sum(active, (x) => (x.direct_payment_enabled ? Math.min(Number(x.direct_payment_amount), Number(x.final_freight)) : 0)),
    freightPayable: sum(active, (x) => Number(x.freight_payable)),
    tripExpenses: sum(exp.filter((e) => e.scope === "trip"), (e) => Number(e.amount)),
    consignorExpenses: sum(exp.filter((e) => e.scope === "consignor"), (e) => Number(e.amount)),
    consignorCharged: sum(exp.filter((e) => e.scope === "consignor" && e.responsible === "party"), (e) => Number(e.amount)),
    consigneeExpenses: sum(exp.filter((e) => e.scope === "consignee"), (e) => Number(e.amount)),
    consigneeCharged: sum(exp.filter((e) => e.scope === "consignee" && e.responsible === "party"), (e) => Number(e.amount)),
    driverAdvances: sum(adv.filter((a) => a.recipient_type === "driver"), (a) => Number(a.amount)),
    transporterAdvances: sum(adv.filter((a) => a.recipient_type !== "driver"), (a) => Number(a.amount)),
    commissionPending: sum(legs.flatMap((l) => l.commissions), (x) => Number(x.pending_amount)),
    commissionReceived: sum(legs.flatMap((l) => l.commissions), (x) => Number(x.received_amount)),
    weight: active.length,
  };
}

function SummaryGrid({ s, label }: { s: ReturnType<typeof summarize>; label: string }) {
  const items: [string, number, string?][] = [
    ["Freight billed to parties (receivable)", s.freightReceivable, "success"],
    ["…of which paid to driver directly by consignee", s.directPaid],
    ["Freight payable to transporter", s.freightPayable, "warning"],
    ["Advances to transporter / truck owner", s.transporterAdvances],
    ["Transporter payable remaining (est.)", Math.max(0, s.freightPayable - s.transporterAdvances - Math.min(s.directPaid, s.freightPayable)), "warning"],
    ["Trip expenses (Gokul)", s.tripExpenses],
    ["Consignor expenses (total / charged to party)", s.consignorExpenses],
    ["Consignee expenses (total / charged to party)", s.consigneeExpenses],
    ["Driver advances", s.driverAdvances],
    ["Commission received", s.commissionReceived, "success"],
    ["Commission pending (not income yet)", s.commissionPending, "warning"],
  ];
  return (
    <div>
      <p className="mb-2 text-sm font-semibold text-primary">{label}</p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {items.map(([k, v, tone]) => (
          <div key={k} className="rounded-md border bg-background p-3">
            <p className="text-xs text-muted-foreground">{k}</p>
            <p className={`font-semibold ${tone === "success" ? "text-success" : tone === "warning" ? "text-warning-foreground" : ""}`}>
              <Money value={v} />
              {k.startsWith("Consignor") && <span className="text-xs font-normal text-muted-foreground"> / <Money value={s.consignorCharged} /></span>}
              {k.startsWith("Consignee") && <span className="text-xs font-normal text-muted-foreground"> / <Money value={s.consigneeCharged} /></span>}
            </p>
          </div>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">These figures are kept separate on purpose. No "profit" is calculated.</p>
    </div>
  );
}

function TripDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const vehicles = useVehicles(); const drivers = useDrivers(); const transporters = useTransporters();
  const q = useQuery({ queryKey: ["trip", id], queryFn: () => loadFamily(id) });
  const unlinked = useQuery({
    queryKey: ["lrs-unlinked"],
    queryFn: async () => {
      const { data, error } = await supabase.from("lrs").select("id, lr_number, lr_date").is("trip_id", null).eq("status", "active").order("lr_number");
      if (error) throw error;
      return data;
    },
  });
  const [linkId, setLinkId] = useState("");
  const updLr = useMutation({
    mutationFn: async ({ lrId, patch }: { lrId: string; patch: Record<string, unknown> }) => {
      const { error } = await supabase.from("lrs").update(patch as never).eq("id", lrId);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("LR updated"); qc.invalidateQueries({ queryKey: ["trip", id] }); qc.invalidateQueries({ queryKey: ["lrs-unlinked"] }); qc.invalidateQueries({ queryKey: ["lrs"] }); },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (q.isPending) return <LoadingState />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const leg = q.data.legs.find((l) => l.trip.id === id);
  if (!leg) return <ErrorState error={new Error("Trip not found")} />;
  const t = leg.trip;
  const route = t.trip_stops.map((s: any) => s.location).join(" → ");
  const others = q.data.legs.filter((l) => l.trip.id !== id);

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm" className="no-print"><Link to="/trips"><ArrowLeft className="mr-1 h-4 w-4" />All trips</Link></Button>
      <PageHeader title={`${t.trip_number}${t.leg_label ? ` · ${t.leg_label}` : ""}`} description={`${formatDate(t.trip_date)} · ${route}`}
        actions={<>
          <Button variant="outline" onClick={() => window.print()}><Printer className="mr-1 h-4 w-4" />Print</Button>
          <Button variant="outline" asChild><Link to="/trips/new" search={{ parent: q.data.root, kind: "return" }}><Plus className="mr-1 h-4 w-4" />Create return leg</Link></Button>
          <Button variant="outline" asChild><Link to="/trips/new" search={{ parent: q.data.root, kind: "leg" }}><Plus className="mr-1 h-4 w-4" />Linked leg (vehicle/driver change)</Link></Button>
          <Button asChild><Link to="/trips/$id/edit" params={{ id }}><Pencil className="mr-1 h-4 w-4" />Edit</Link></Button>
        </>} />
      <div className="grid gap-3 rounded-lg border bg-card p-4 text-sm sm:grid-cols-4">
        <div><p className="text-muted-foreground">Status</p><StatusBadge tone={TRIP_STATUS[t.status]?.tone}>{TRIP_STATUS[t.status]?.label}</StatusBadge>{t.cancel_reason && <p className="text-xs">Reason: {t.cancel_reason}</p>}</div>
        <div><p className="text-muted-foreground">Vehicle</p><p>{t.vehicle_mode === "own" ? nameOf(vehicles.data, t.vehicle_id, "registration_number") || "—" : `${t.market_vehicle_number} (market truck${t.market_vehicle_type ? ", " + t.market_vehicle_type : ""})`}</p></div>
        <div><p className="text-muted-foreground">Transporter</p><p>{nameOf(transporters.data, t.transporter_id) || "—"}</p></div>
        <div><p className="text-muted-foreground">Driver</p><p>{nameOf(drivers.data, t.driver_id) || t.driver_name || "—"}</p></div>
        <div><p className="text-muted-foreground">Direction</p><p>{({ up: "Up / Outward", down: "Down / Return", other: "Other" } as any)[t.direction]}</p></div>
        <div><p className="text-muted-foreground">Journey</p><p>{({ single: "Single", multi: "Multi-stop", round: "Round trip" } as any)[t.journey_type]}</p></div>
        {t.notes && <div className="sm:col-span-2"><p className="text-muted-foreground">Notes</p><p>{t.notes}</p></div>}
      </div>

      {others.length > 0 && (
        <div className="rounded-lg border bg-card p-4 text-sm"><p className="mb-2 font-semibold">Linked legs</p>
          <ul className="space-y-1">{q.data.legs.map((l) => (
            <li key={l.trip.id}>{l.trip.id === id ? <b>{l.trip.trip_number} (this leg)</b> : <Link to="/trips/$id" params={{ id: l.trip.id }} className="text-info hover:underline">{l.trip.trip_number}</Link>}
              {" "}· {l.trip.leg_label || (l.trip.parent_trip_id ? "Leg" : "Outward / first leg")} · {l.trip.trip_stops.map((s: any) => s.location).join(" → ")} · {l.lrs.length} LR(s)</li>))}</ul>
        </div>
      )}

      <Section title="Stop-by-stop">
        <div className="space-y-3">
          {t.trip_stops.map((s: any, i: number) => {
            const pick = leg.lrs.filter((l) => l.loading_stop_id === s.id);
            const drop = leg.lrs.filter((l) => l.unloading_stop_id === s.id);
            return (
              <div key={s.id} className="rounded-md border p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2"><b>{i + 1}. {s.location}</b><StatusBadge tone="info">{s.stop_type}</StatusBadge><StatusBadge tone={s.status === "completed" ? "success" : s.status === "skipped" ? "danger" : "muted"}>{s.status}</StatusBadge>
                  <span className="text-xs text-muted-foreground">{s.planned_arrival && `Planned ${formatDateTime(s.planned_arrival)}`} {s.actual_arrival && `· Arrived ${formatDateTime(s.actual_arrival)}`}</span></div>
                {pick.length > 0 && <p className="mt-1">Picked up: {pick.map((l) => l.lr_number).join(", ")}</p>}
                {drop.map((l) => (
                  <p key={l.id} className="mt-1 flex items-center gap-2">Unload: {l.lr_number} <StatusBadge tone={LR_DELIVERY[l.delivery_status]?.tone}>{LR_DELIVERY[l.delivery_status]?.label}</StatusBadge>
                    {l.delivery_status !== "delivered" && <Button size="sm" variant="outline" className="no-print h-7" disabled={updLr.isPending} onClick={() => updLr.mutate({ lrId: l.id, patch: { delivery_status: "delivered" } })}>Mark this LR delivered</Button>}</p>
                ))}
              </div>
            );
          })}
        </div>
      </Section>

      <Section title={`Loads & LR / Bilties (${leg.lrs.length})`}>
        <div className="no-print mb-3 flex flex-wrap items-end gap-2">
          <Button size="sm" asChild><Link to="/lr/new" search={{ trip: id }}><Plus className="mr-1 h-4 w-4" />Add LR to this trip</Link></Button>
          <select className={selectCls + " max-w-56"} value={linkId} onChange={(e) => setLinkId(e.target.value)}>
            <option value="">Link an existing LR…</option>{unlinked.data?.map((l) => <option key={l.id} value={l.id}>{l.lr_number} ({formatDate(l.lr_date)})</option>)}
          </select>
          <Button size="sm" variant="outline" disabled={!linkId || updLr.isPending} onClick={() => { updLr.mutate({ lrId: linkId, patch: { trip_id: id } }); setLinkId(""); }}><Link2 className="mr-1 h-4 w-4" />Link</Button>
        </div>
        {leg.lrs.length === 0 ? <p className="text-sm text-muted-foreground">No LRs on this leg (an empty leg is allowed).</p> : (
          <div className="overflow-x-auto rounded border"><Table>
            <TableHeader><TableRow><TableHead>LR</TableHead><TableHead>Consignor → Consignee</TableHead><TableHead>Weight</TableHead><TableHead>Freight type</TableHead><TableHead className="text-right">Base</TableHead><TableHead className="text-right">+/−</TableHead><TableHead className="text-right">Final freight</TableHead><TableHead className="text-right">Payable</TableHead><TableHead>Delivery</TableHead></TableRow></TableHeader>
            <TableBody>{leg.lrs.map((l) => (
              <TableRow key={l.id} className={l.status === "cancelled" ? "opacity-50" : ""}>
                <TableCell><Link to="/lr/$id" params={{ id: l.id }} className="font-medium text-info hover:underline">{l.lr_number}</Link>{l.status === "cancelled" && <StatusBadge tone="danger">Cancelled</StatusBadge>}</TableCell>
                <TableCell>{l.lr_parties.filter((p: any) => p.role === "consignor").map((p: any) => p.parties?.name).join(", ")} → {l.lr_parties.filter((p: any) => p.role === "consignee").map((p: any) => p.parties?.name).join(", ")}</TableCell>
                <TableCell>{l.weight ? `${l.weight} ${l.weight_unit}` : "—"}</TableCell><TableCell>{FREIGHT_TYPE[l.freight_type]}</TableCell>
                <TableCell className="text-right"><Money value={l.base_freight} /></TableCell>
                <TableCell className="text-right text-xs">+<Money value={l.additions_total} /> −<Money value={l.deductions_total} /></TableCell>
                <TableCell className="text-right font-medium"><Money value={l.final_freight} /></TableCell>
                <TableCell className="text-right"><Money value={l.freight_payable} /></TableCell>
                <TableCell><StatusBadge tone={LR_DELIVERY[l.delivery_status]?.tone}>{LR_DELIVERY[l.delivery_status]?.label}</StatusBadge></TableCell>
              </TableRow>))}</TableBody>
          </Table></div>
        )}
      </Section>

      <Section title="Trip expenses"><TripExpenses tripId={id} /></Section>
      <Section title="Advances (driver / transporter / truck owner)"><TripAdvances tripId={id} defaultDriverId={t.driver_id} defaultTransporterId={t.transporter_id} /></Section>
      <Section title="Trip commission"><CommissionPanel tripId={id} />{leg.lrs.filter((l) => l.commission_enabled).map((l) => <CommissionPanel key={l.id} lrId={l.id} />)}</Section>

      <Section title="Trip summary">
        <div className="space-y-6">
          <SummaryGrid s={summarize([leg])} label={`This leg (${t.trip_number})`} />
          {others.length > 0 && <SummaryGrid s={summarize(q.data.legs)} label={`Round-trip totals — all ${q.data.legs.length} legs added once each`} />}
        </div>
      </Section>
    </div>
  );
}
