import { DocumentActions } from "@/components/app/DocumentActions";
import { actionCell } from "@/components/app/RowActions";
import { MobileCards, MobileCard, dateRangeCls } from "@/components/app/MobileCards";
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
import { lrVehicleNumber, lrVehicleLabel, lrProfitFromRow } from "@/lib/lr-summary";
import { formatDate } from "@/lib/format";
import { exportRows, money2 } from "@/lib/export";

export const Route = createFileRoute("/_authenticated/lr/")({
  head: () => pageHead("LR / Bilty Register — Gokul Cargo Movers", "LR / Bilty Register records for Gokul Cargo Movers transport management."),
  component: LRList,
});

const PAGE = 25;

function LRList() {
  const [f, setF] = useState({ search: "", from: "", to: "", status: "active" });
  const [page, setPage] = useState(0);
  const q = useQuery({
    queryKey: ["lrs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("lrs").select("*, trips(trip_number, market_vehicle_number, vehicles(registration_number)), lr_parties(role, parties(name)), expenses(amount, responsible, scope, is_cancelled)").order("lr_date", { ascending: false }).order("lr_number", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });
  const rows = useMemo(() => (q.data ?? []).filter((l) => {
    if (f.status && l.status !== f.status) return false;
    if (f.from && l.lr_date < f.from) return false;
    if (f.to && l.lr_date > f.to) return false;
    const s = f.search.trim().toLowerCase();
    if (!s) return true;
    return [l.lr_number, lrVehicleNumber(l), l.vehicle_number, ...l.lr_parties.map((p: any) => p.parties?.name)].join(" ").toLowerCase().includes(s);
  }), [q.data, f]);
  const profitOf = (l: any) => lrProfitFromRow(l);
  const tot = rows.reduce((a, l) => { const pr = profitOf(l).profit; return { f: a.f + Number(l.final_freight), p: a.p + Number(l.freight_payable), pr: a.pr + (pr ?? 0) }; }, { f: 0, p: 0, pr: 0 });
  const ProfitCell = ({ l }: { l: any }) => {
    const pr = profitOf(l);
    if (pr.profit == null) return <span className="text-muted-foreground">—</span>;
    return <span className={pr.profit < 0 ? "text-destructive" : ""}><Money value={pr.profit} />{pr.state === "provisional" && <span className="block text-[10px] text-muted-foreground">Provisional</span>}</span>;
  };
  return (
    <div>
      <PageHeader title="LR / Bilty Register" actions={<div className="flex gap-2"><Button variant="outline" disabled={q.isPending || q.isError} onClick={() => exportRows("lr-bilty-register", [
        ["LR No", "Date", "Status", "Delivery status", "Trip", "Vehicle number", "Driver", "Consignor(s)", "Consignee(s)", "Loading point", "Delivery point", "Freight type", "LR freight (INR)", "Freight payable (INR)", "Commission (INR)", "Profit (INR)"],
        ...rows.map((l) => [l.lr_number, formatDate(l.lr_date), l.status, l.delivery_status, l.trips?.trip_number ?? "", lrVehicleNumber(l) ?? "", l.driver_name ?? "",
          l.lr_parties.filter((p: any) => p.role === "consignor").map((p: any) => p.parties?.name).join("; "), l.lr_parties.filter((p: any) => p.role === "consignee").map((p: any) => p.parties?.name).join("; "),
          l.loading_point ?? "", l.delivery_point ?? "", l.freight_type, money2(l.final_freight), money2(l.freight_payable), l.commission_enabled ? money2(l.commission_amount) : "", profitOf(l).profit == null ? "" : money2(profitOf(l).profit)]),
      ])}>Export CSV</Button><Button asChild><Link to="/lr/new" search={{}}><Plus className="mr-1 h-4 w-4" />New LR</Link></Button></div>} />
      <div role="search" aria-label="Filter LR records" className="list-filters mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Input aria-label="Search LR records" className="sm:col-span-2" placeholder="Search LR no., party, vehicle number…" value={f.search} onChange={(e) => { setF({ ...f, search: e.target.value }); setPage(0); }} />
        <select aria-label="LR status" className={selectCls} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="active">Active</option><option value="cancelled">Cancelled</option><option value="">All</option></select>
        <div className={dateRangeCls}><Input type="date" aria-label="From date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /><Input type="date" aria-label="To date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></div>
      </div>
      {q.isPending ? <LoadingState /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : rows.length === 0 ? (
        <EmptyState title={q.data.length ? "No LRs match" : "No LRs yet"} action={!q.data.length ? <Button asChild><Link to="/lr/new" search={{}}>Create first LR</Link></Button> : undefined} />
      ) : (
        <div className="rounded-lg sm:border sm:bg-card">
          <MobileCards>{rows.slice(page * PAGE, page * PAGE + PAGE).map((l) => (
            <MobileCard key={l.id} muted={l.status === "cancelled"}
              title={<Link to="/lr/$id" params={{ id: l.id }} className="text-info">{l.lr_number}</Link>}
              aside={<Money value={l.final_freight} />} actions={<DocumentActions kind="lr" row={l} />}>
              <div>{formatDate(l.lr_date)} · Vehicle: {lrVehicleLabel(l)}</div>
              <div>Payable <Money value={l.freight_payable} /> · Profit <ProfitCell l={l} /></div>
              <div className="text-foreground">{l.lr_parties.filter((p: any) => p.role === "consignor").map((p: any) => p.parties?.name).join(", ")} → {l.lr_parties.filter((p: any) => p.role === "consignee").map((p: any) => p.parties?.name).join(", ")}</div>
              {l.status === "cancelled" && <div><StatusBadge tone="danger">Cancelled</StatusBadge></div>}
            </MobileCard>))}</MobileCards>
          <div className="hidden overflow-x-auto sm:block"><Table className="sm:table-fixed text-xs">
          <TableHeader><TableRow><TableHead className="w-24">LR / Date</TableHead><TableHead className="w-28">Vehicle Number</TableHead><TableHead>Consignor → Consignee</TableHead><TableHead className="w-24 text-right">Freight</TableHead><TableHead className="hidden w-24 xl:table-cell text-right">Payable</TableHead><TableHead className="w-24 text-right">Profit Per LR</TableHead><TableHead className="w-24">Status</TableHead><TableHead className={actionCell + " w-12 sm:w-28"}>Actions</TableHead></TableRow></TableHeader>
          <TableBody>{rows.slice(page * PAGE, page * PAGE + PAGE).map((l) => (
            <TableRow key={l.id} className={l.status === "cancelled" ? "opacity-50" : ""}>
              <TableCell><Link to="/lr/$id" params={{ id: l.id }} className="font-medium text-info hover:underline">{l.lr_number}</Link><span className="block text-muted-foreground">{formatDate(l.lr_date)}</span></TableCell>
              <TableCell className="break-words">{lrVehicleNumber(l) ? <span className="font-medium">{lrVehicleNumber(l)}</span> : <span className="text-muted-foreground">Not Assigned</span>}</TableCell>
              <TableCell className="min-w-40 whitespace-normal break-words">{l.lr_parties.filter((p: any) => p.role === "consignor").map((p: any) => p.parties?.name).join(", ")} → {l.lr_parties.filter((p: any) => p.role === "consignee").map((p: any) => p.parties?.name).join(", ")}</TableCell>
              <TableCell className="text-right"><Money value={l.final_freight} /></TableCell>
              <TableCell className="hidden xl:table-cell text-right"><Money value={l.freight_payable} /></TableCell>
              <TableCell className="text-right"><ProfitCell l={l} /></TableCell>
              <TableCell>{l.status === "cancelled" ? <StatusBadge tone="danger">Cancelled</StatusBadge> : <StatusBadge tone="success">Active</StatusBadge>}</TableCell>
              <TableCell className={actionCell}><DocumentActions kind="lr" row={l} /></TableCell>
            </TableRow>))}</TableBody>
        </Table></div>
          <div className="mt-2 rounded border bg-muted px-3 py-2 text-sm sm:mt-0 sm:rounded-none sm:border-0 sm:border-t sm:text-xs">Total ({rows.length} LRs) · Freight <Money value={tot.f} /> · Payable <Money value={tot.p} /> · Profit <Money value={tot.pr} /></div>
          <div className="grid grid-cols-2 gap-2 py-2 sm:flex sm:justify-end sm:border-t sm:px-3"><Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button><Button variant="outline" size="sm" disabled={(page + 1) * PAGE >= rows.length} onClick={() => setPage(page + 1)}>Next</Button></div>
        </div>
      )}
    </div>
  );
}
