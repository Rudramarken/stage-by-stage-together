import { DocumentActions } from "@/components/app/DocumentActions";
import { actionCell } from "@/components/app/RowActions";
import { MobileCards, MobileCard, dateRangeCls } from "@/components/app/MobileCards";
import { pageHead } from "@/lib/page-head";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, StatusBadge } from "@/components/app/ui";
import { LoadingState, ErrorState, EmptyState } from "@/components/app/states";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { selectCls } from "@/components/app/Section";
import { useDrivers, useTransporters, useVehicles, nameOf, TRIP_STATUS } from "@/lib/lookups";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/trips/")({
  head: () => pageHead("Trips — Gokul Cargo Movers", "Trips records for Gokul Cargo Movers transport management."),
  component: TripsList,
});

const PAGE = 25;

function TripsList() {
  const drivers = useDrivers(); const transporters = useTransporters(); const vehicles = useVehicles();
  const [f, setF] = useState({ search: "", status: "", from: "", to: "", transporter: "", driver: "" });
  const [page, setPage] = useState(0);
  const q = useQuery({
    queryKey: ["trips"],
    queryFn: async () => {
      const { data, error } = await supabase.from("trips").select("*, trip_stops(location, seq), lrs(id, lr_number, lr_parties(party_id, parties(name)))").order("trip_date", { ascending: false }).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const rows = useMemo(() => (q.data ?? []).filter((t: any) => {
    if (f.status && t.status !== f.status) return false;
    if (f.from && t.trip_date < f.from) return false;
    if (f.to && t.trip_date > f.to) return false;
    if (f.transporter && t.transporter_id !== f.transporter) return false;
    if (f.driver && t.driver_id !== f.driver) return false;
    const s = f.search.trim().toLowerCase();
    if (!s) return true;
    const hay = [t.trip_number, t.market_vehicle_number, t.driver_name, nameOf(vehicles.data, t.vehicle_id, "registration_number"), ...t.trip_stops.map((x: any) => x.location),
      ...t.lrs.flatMap((l: any) => [l.lr_number, ...l.lr_parties.map((p: any) => p.parties?.name)])].join(" ").toLowerCase();
    return hay.includes(s);
  }), [q.data, f, vehicles.data]);
  const paged = rows.slice(page * PAGE, page * PAGE + PAGE);
  return (
    <div>
      <PageHeader title="Trips" description="Every journey leg. Search by trip no., place, vehicle, driver, LR or party."
        actions={<Button asChild><Link to="/trips/new"><Plus className="mr-1 h-4 w-4" />New trip</Link></Button>} />
      <div className="mb-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Input className="lg:col-span-2" placeholder="Search…" value={f.search} onChange={(e) => { setF({ ...f, search: e.target.value }); setPage(0); }} />
        <select className={selectCls} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="">All statuses</option>{Object.entries(TRIP_STATUS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}</select>
        <select className={selectCls} value={f.transporter} onChange={(e) => setF({ ...f, transporter: e.target.value })}><option value="">All transporters</option>{transporters.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
        <select className={selectCls} value={f.driver} onChange={(e) => setF({ ...f, driver: e.target.value })}><option value="">All drivers</option>{drivers.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
        <div className={dateRangeCls}><Input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} title="From" aria-label="From date" /><Input type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} title="To" aria-label="To date" /></div>
      </div>
      {q.isPending ? <LoadingState /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : rows.length === 0 ? (
        <EmptyState title={q.data.length ? "No trips match these filters" : "No trips yet"} action={!q.data.length ? <Button asChild><Link to="/trips/new">Create first trip</Link></Button> : undefined} />
      ) : (
        <div className="rounded-lg sm:border sm:bg-card">
          <MobileCards>{paged.map((t: any) => (
            <MobileCard key={t.id} muted={t.status === "cancelled"}
              title={<><Link to="/trips/$id" params={{ id: t.id }} className="text-info">{t.trip_number}</Link>{t.parent_trip_id && <span className="ml-1 text-xs text-muted-foreground">({t.leg_label || "leg"})</span>}</>}
              aside={<StatusBadge tone={TRIP_STATUS[t.status]?.tone}>{TRIP_STATUS[t.status]?.label}</StatusBadge>} actions={<DocumentActions kind="trip" row={t} />}>
              <div>{formatDate(t.trip_date)} · {t.lrs.length} LR(s)</div>
              <div className="text-foreground">{[...t.trip_stops].sort((a: any, b: any) => a.seq - b.seq).map((s: any) => s.location).join(" → ")}</div>
              <div>{t.vehicle_mode === "own" ? nameOf(vehicles.data, t.vehicle_id, "registration_number") || "—" : `${t.market_vehicle_number ?? ""} (market)`} · {nameOf(drivers.data, t.driver_id) || t.driver_name || "No driver"}</div>
              {t.transporter_id && <div>{nameOf(transporters.data, t.transporter_id)}</div>}
            </MobileCard>))}</MobileCards>
          <div className="hidden overflow-x-auto sm:block">
          <Table>
            <TableHeader><TableRow><TableHead>Trip</TableHead><TableHead>Date</TableHead><TableHead>Route</TableHead><TableHead>Vehicle</TableHead><TableHead>Transporter</TableHead><TableHead>Driver</TableHead><TableHead>LRs</TableHead><TableHead>Status</TableHead><TableHead className={actionCell}>Actions</TableHead></TableRow></TableHeader>
            <TableBody>{paged.map((t: any) => (
              <TableRow key={t.id}>
                <TableCell><Link to="/trips/$id" params={{ id: t.id }} className="font-medium text-info hover:underline">{t.trip_number}</Link>{t.parent_trip_id && <span className="ml-1 text-xs text-muted-foreground">({t.leg_label || "leg"})</span>}</TableCell>
                <TableCell>{formatDate(t.trip_date)}</TableCell>
                <TableCell className="max-w-48 whitespace-normal">{[...t.trip_stops].sort((a: any, b: any) => a.seq - b.seq).map((s: any) => s.location).join(" → ")}</TableCell>
                <TableCell>{t.vehicle_mode === "own" ? nameOf(vehicles.data, t.vehicle_id, "registration_number") || "—" : <>{t.market_vehicle_number} <span className="text-xs text-muted-foreground">market</span></>}</TableCell>
                <TableCell>{nameOf(transporters.data, t.transporter_id) || "—"}</TableCell>
                <TableCell>{nameOf(drivers.data, t.driver_id) || t.driver_name || "—"}</TableCell>
                <TableCell>{t.lrs.length}</TableCell>
                <TableCell><StatusBadge tone={TRIP_STATUS[t.status]?.tone}>{TRIP_STATUS[t.status]?.label}</StatusBadge></TableCell>
                <TableCell className={actionCell}><DocumentActions kind="trip" row={t} /></TableCell>
              </TableRow>))}</TableBody>
          </Table></div>
          <div className="flex flex-col gap-2 py-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:border-t sm:px-3"><span>{rows.length} trip(s)</span>
            <div className="grid grid-cols-2 gap-2 sm:flex"><Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button><Button variant="outline" size="sm" disabled={(page + 1) * PAGE >= rows.length} onClick={() => setPage(page + 1)}>Next</Button></div></div>
        </div>
      )}
    </div>
  );
}
