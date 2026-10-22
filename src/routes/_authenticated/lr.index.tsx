import { DocumentActions } from "@/components/app/DocumentActions";
import { actionCell } from "@/components/app/RowActions";
import { pageHead } from "@/lib/page-head";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, StatusBadge, Money } from "@/components/app/ui";
import { LoadingState, ErrorState, EmptyState } from "@/components/app/states";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { selectCls } from "@/components/app/Section";
import { LR_DELIVERY, FREIGHT_TYPE } from "@/lib/lookups";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/lr/")({
  head: () => pageHead("LR / Bilty Register — Gokul Cargo Movers", "LR / Bilty Register records for Gokul Cargo Movers transport management."),
  component: LRList,
});

const PAGE = 25;

function LRList() {
  const [f, setF] = useState({ search: "", delivery: "", from: "", to: "", status: "active" });
  const [page, setPage] = useState(0);
  const q = useQuery({
    queryKey: ["lrs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("lrs").select("*, trips(trip_number), lr_parties(role, parties(name))").order("lr_date", { ascending: false }).order("lr_number", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });
  const rows = useMemo(() => (q.data ?? []).filter((l) => {
    if (f.status && l.status !== f.status) return false;
    if (f.delivery && l.delivery_status !== f.delivery) return false;
    if (f.from && l.lr_date < f.from) return false;
    if (f.to && l.lr_date > f.to) return false;
    const s = f.search.trim().toLowerCase();
    if (!s) return true;
    return [l.lr_number, l.trips?.trip_number, l.vehicle_number, ...l.lr_parties.map((p: any) => p.parties?.name)].join(" ").toLowerCase().includes(s);
  }), [q.data, f]);
  const tot = rows.reduce((a, l) => ({ f: a.f + Number(l.final_freight), p: a.p + Number(l.freight_payable) }), { f: 0, p: 0 });
  return (
    <div>
      <PageHeader title="LR / Bilty Register" actions={<Button asChild><Link to="/lr/new" search={{}}><Plus className="mr-1 h-4 w-4" />New LR</Link></Button>} />
      <div className="mb-4 grid gap-2 sm:grid-cols-5">
        <Input className="sm:col-span-2" placeholder="Search LR no., party, trip, vehicle…" value={f.search} onChange={(e) => { setF({ ...f, search: e.target.value }); setPage(0); }} />
        <select className={selectCls} value={f.delivery} onChange={(e) => setF({ ...f, delivery: e.target.value })}><option value="">All delivery</option>{Object.entries(LR_DELIVERY).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}</select>
        <select className={selectCls} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="active">Active</option><option value="cancelled">Cancelled</option><option value="">All</option></select>
        <div className="flex gap-1"><Input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /><Input type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></div>
      </div>
      {q.isPending ? <LoadingState /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : rows.length === 0 ? (
        <EmptyState title={q.data.length ? "No LRs match" : "No LRs yet"} action={!q.data.length ? <Button asChild><Link to="/lr/new" search={{}}>Create first LR</Link></Button> : undefined} />
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card"><Table className="table-fixed min-w-[620px] text-xs">
          <TableHeader><TableRow><TableHead className="w-24">LR / Date</TableHead><TableHead className="hidden w-24 xl:table-cell">Trip</TableHead><TableHead>Consignor → Consignee</TableHead><TableHead className="hidden w-20 xl:table-cell">Type</TableHead><TableHead className="w-24 text-right">Freight</TableHead><TableHead className="hidden w-24 xl:table-cell text-right">Payable</TableHead><TableHead className="w-24">Delivery</TableHead><TableHead className={actionCell + " w-28"}>Actions</TableHead></TableRow></TableHeader>
          <TableBody>{rows.slice(page * PAGE, page * PAGE + PAGE).map((l) => (
            <TableRow key={l.id} className={l.status === "cancelled" ? "opacity-50" : ""}>
              <TableCell><Link to="/lr/$id" params={{ id: l.id }} className="font-medium text-info hover:underline">{l.lr_number}</Link><span className="block text-muted-foreground">{formatDate(l.lr_date)}</span></TableCell>
              <TableCell className="hidden xl:table-cell">{l.trip_id ? <Link to="/trips/$id" params={{ id: l.trip_id }} className="hover:underline">{l.trips?.trip_number}</Link> : <span className="text-muted-foreground">No trip</span>}</TableCell>
              <TableCell className="whitespace-normal break-words">{l.lr_parties.filter((p: any) => p.role === "consignor").map((p: any) => p.parties?.name).join(", ")} → {l.lr_parties.filter((p: any) => p.role === "consignee").map((p: any) => p.parties?.name).join(", ")}</TableCell>
              <TableCell className="hidden xl:table-cell text-xs">{FREIGHT_TYPE[l.freight_type]}</TableCell>
              <TableCell className="text-right"><Money value={l.final_freight} /></TableCell>
              <TableCell className="hidden xl:table-cell text-right"><Money value={l.freight_payable} /></TableCell>
              <TableCell>{l.status === "cancelled" ? <StatusBadge tone="danger">Cancelled</StatusBadge> : <StatusBadge tone={LR_DELIVERY[l.delivery_status]?.tone}>{LR_DELIVERY[l.delivery_status]?.label}</StatusBadge>}</TableCell>
              <TableCell className={actionCell}><DocumentActions kind="lr" row={l} /></TableCell>
            </TableRow>))}</TableBody>
          <TableFooter><TableRow><TableCell colSpan={8}>Total ({rows.length} LRs) · Freight <Money value={tot.f} /> · Payable <Money value={tot.p} /></TableCell></TableRow></TableFooter>
        </Table>
          <div className="flex justify-end gap-2 border-t px-3 py-2"><Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button><Button variant="outline" size="sm" disabled={(page + 1) * PAGE >= rows.length} onClick={() => setPage(page + 1)}>Next</Button></div>
        </div>
      )}
    </div>
  );
}
