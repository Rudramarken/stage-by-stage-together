import { useState } from "react";
import { RemovalDialog, type RemovalTarget } from "@/components/app/RemovalDialog";
import { DocumentPrint } from "@/components/app/DocumentPrint";
import { Trash2 } from "lucide-react";
import { pageHead } from "@/lib/page-head";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Pencil, Printer, Ban } from "lucide-react";
import { CommissionPanel } from "@/components/app/CommissionPanel";
import { supabase } from "@/integrations/supabase/client";
import { Money, StatusBadge } from "@/components/app/ui";
import { LoadingState, ErrorState, errorMessage } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { loadLR } from "@/lib/lr-load";
import { useBusiness } from "@/lib/business";
import { useTransporters, nameOf, FREIGHT_TYPE, LR_DELIVERY } from "@/lib/lookups";
import { RATE_UNIT_LABEL } from "@/lib/freight";
import { formatDate, formatDateTime, formatINR } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/lr/$id/")({
  head: () => pageHead("LR details — Gokul Cargo Movers", "LR details records for Gokul Cargo Movers transport management."),
  component: LRDetail,
});

function LRDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const { settings, role } = useBusiness();
  const navigate = useNavigate();
  const [removal, setRemoval] = useState<RemovalTarget | null>(null);
  const transporters = useTransporters();
  const q = useQuery({ queryKey: ["lr", id], queryFn: () => loadLR(id) });
  const upd = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      const { error } = await supabase.from("lrs").update(patch as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("LR updated"); qc.invalidateQueries({ queryKey: ["lr", id] }); qc.invalidateQueries({ queryKey: ["lrs"] }); qc.invalidateQueries({ queryKey: ["ledger"] }); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (q.isPending) return <LoadingState />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const { lr, expenses, trip } = q.data;
  const cnor = lr.lr_parties.filter((p: any) => p.role === "consignor").sort((a: any, b: any) => a.seq - b.seq);
  const cnee = lr.lr_parties.filter((p: any) => p.role === "consignee").sort((a: any, b: any) => a.seq - b.seq);
  const stops = trip ? [...trip.trip_stops].sort((a: any, b: any) => a.seq - b.seq) : [];
  const stopName = (sid: string) => stops.find((s: any) => s.id === sid)?.location;

  return (
    <div className="space-y-4">
      <DocumentPrint id={id} />
      <RemovalDialog target={removal} onClose={() => setRemoval(null)} onDone={() => { if (removal?.action === "delete") navigate({ to: "/lr" }); }} />
      <div className="no-print flex flex-wrap gap-2">
        <Button asChild variant="ghost" size="sm"><Link to="/lr"><ArrowLeft className="mr-1 h-4 w-4" />LR register</Link></Button>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => window.print()}><Printer className="mr-1 h-4 w-4" />Print</Button>
          {lr.status === "active" && <Button variant="outline" disabled={upd.isPending} onClick={() => setRemoval({ table: "lrs", id, label: lr.lr_number, action: "cancel" })}><Ban className="mr-1 h-4 w-4" />Cancel LR</Button>}
          {lr.status === "active" && <Button asChild><Link to="/lr/$id/edit" params={{ id }}><Pencil className="mr-1 h-4 w-4" />Edit</Link></Button>}
          {role === "owner" && <Button variant="destructive" onClick={() => setRemoval({ table: "lrs", id, label: lr.lr_number, action: "delete" })}><Trash2 className="mr-1 h-4 w-4" />Delete permanently</Button>}
        </div>
      </div>
      {lr.status === "cancelled" && <p className="text-sm text-destructive">Cancelled by {lr.cancelled_by} · {formatDateTime(lr.cancelled_at)} · {lr.cancel_reason}</p>}

      <div className="mx-auto max-w-[210mm] rounded-lg border bg-card p-6 text-sm print:border-0 print:p-0">
        <div className="flex items-start justify-between border-b-2 border-primary pb-3">
          <div><p className="font-display text-2xl font-bold text-primary">Gokul Cargo Movers</p>
            <p className="text-xs text-muted-foreground">{[settings?.address, settings?.city, settings?.state].filter(Boolean).join(", ")} {settings?.phone && `· ${settings.phone}`}</p></div>
          <div className="text-right"><p className="text-xs uppercase text-muted-foreground">Lorry Receipt / Bilty</p><p className="text-xl font-bold">{lr.lr_number}</p><p>{formatDate(lr.lr_date)}</p>
            {lr.status === "cancelled" && <StatusBadge tone="danger">CANCELLED: {lr.cancel_reason}</StatusBadge>}</div>
        </div>
        {trip && <p className="mt-2">Trip <Link to="/trips/$id" params={{ id: trip.id }} className="text-info hover:underline">{trip.trip_number}</Link>: {stops.map((s: any) => s.location).join(" → ")}
          {lr.loading_stop_id && ` · Loads at ${stopName(lr.loading_stop_id)}`}{lr.unloading_stop_id && ` · Unloads at ${stopName(lr.unloading_stop_id)}`}</p>}
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {[["Consignor(s)", cnor], ["Consignee(s)", cnee]].map(([title, list]: any) => (
            <div key={title} className="rounded border p-3"><p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">{title}</p>
              {list.map((p: any) => (
                <div key={p.id} className="mb-2"><p className="font-semibold">{p.parties?.name}</p>
                  <p className="text-xs">{[p.goods_description, p.quantity && `Qty ${p.quantity}`, p.weight && `${p.weight} ${lr.weight_unit}`].filter(Boolean).join(" · ")}</p>
                  <p className="text-xs text-muted-foreground">{[p.loading_point && `From ${p.loading_point}`, p.delivery_point && `To ${p.delivery_point}`].filter(Boolean).join(" · ")}</p>
                  {expenses.filter((e) => e.lr_party_id === p.id).map((e) => <p key={e.id} className="text-xs">Expense: {e.category} {formatINR(e.amount)} — {e.responsible === "party" ? "charged to party" : "Gokul's own"} ({e.payment_status})</p>)}
                </div>))}
            </div>))}
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <p><span className="text-muted-foreground">Goods:</span> {lr.goods_description || "—"}</p>
          <p><span className="text-muted-foreground">Quantity:</span> {lr.quantity ?? "—"}</p>
          <p><span className="text-muted-foreground">Weight:</span> {lr.weight ? `${lr.weight} ${lr.weight_unit}` : "—"}</p>
          <p><span className="text-muted-foreground">From:</span> {lr.loading_point || "—"}</p>
          <p><span className="text-muted-foreground">To:</span> {lr.delivery_point || "—"}</p>
          <p><span className="text-muted-foreground">Delivery:</span> {LR_DELIVERY[lr.delivery_status]?.label}</p>
          <p><span className="text-muted-foreground">Vehicle:</span> {lr.vehicle_number || "—"} {lr.vehicle_type}</p>
          <p><span className="text-muted-foreground">Driver:</span> {lr.driver_name || "—"}</p>
        </div>
        <table className="mt-4 w-full border text-sm">
          <tbody>
            <tr className="border-b"><td className="p-2">Freight type</td><td className="p-2 text-right">{FREIGHT_TYPE[lr.freight_type]}</td></tr>
            <tr className="border-b"><td className="p-2">Base freight ({RATE_UNIT_LABEL[lr.rate_unit as keyof typeof RATE_UNIT_LABEL]} @ {formatINR(lr.rate)})</td><td className="p-2 text-right"><Money value={lr.base_freight} /></td></tr>
            {lr.lr_adjustments.map((a: any) => <tr key={a.id} className="border-b"><td className="p-2">{a.kind === "add" ? "+" : "−"} {a.reason}</td><td className="p-2 text-right">{a.kind === "add" ? "" : "−"}<Money value={a.amount} /></td></tr>)}
            <tr className="bg-muted font-bold"><td className="p-2">Total freight</td><td className="p-2 text-right"><Money value={lr.final_freight} /></td></tr>
          </tbody>
        </table>
        <div className="mt-6 grid grid-cols-2 gap-8 pt-8 text-xs text-muted-foreground"><p className="border-t pt-1">Consignor signature</p><p className="border-t pt-1 text-right">For Gokul Cargo Movers</p></div>
        <p className="mt-4 text-center text-[10px] text-muted-foreground">Transport document only — not a tax invoice.</p>
      </div>

      <div className="no-print grid gap-3 rounded-lg border bg-card p-4 text-sm sm:grid-cols-3">
        <div><p className="text-muted-foreground">Transporter</p><p>{nameOf(transporters.data, lr.transporter_id) || "—"}</p></div>
        <div><p className="text-muted-foreground">Freight payable to transporter</p><p><Money value={lr.freight_payable} /> <span className="text-xs text-muted-foreground">(paid/remaining in Transporter Settlements)</span></p></div>
        <div><p className="text-muted-foreground">Direct payment to driver</p><p>{lr.direct_payment_enabled ? <Money value={lr.direct_payment_amount} /> : "No"}</p></div>
      </div>
      <div className="no-print"><CommissionPanel lrId={id} /></div>
    </div>
  );
}
