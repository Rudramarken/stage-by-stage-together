import { pageHead } from "@/lib/page-head";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, StatusBadge, Money } from "@/components/app/ui";
import { LoadingState, ErrorState } from "@/components/app/states";
import { LedgerTable, LedgerHelp } from "@/components/app/LedgerTable";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { PARTY_ROLES } from "./parties.index";
import { PartyHistory } from "@/components/app/PartyHistory";
import { useTransporters } from "@/lib/lookups";
import { normName } from "@/lib/transporter-options";

export const Route = createFileRoute("/_authenticated/parties/$id")({
  head: () => pageHead("Party details — Gokul Cargo Movers", "Party details records for Gokul Cargo Movers transport management."),
  component: PartyDetail,
});

function PartyDetail() {
  const { id } = Route.useParams();
  const transporters = useTransporters();
  const q = useQuery({
    queryKey: ["party", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("parties").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Party not found");
      return data;
    },
  });
  if (q.isPending) return <LoadingState />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const p = q.data;
  // Same linking rule as the Party Ledger page: explicit party_id, or an unlinked transporter with the same normalised name.
  const linkedTransporters = ((transporters.data ?? []) as any[]).filter((x) => x.party_id === p.id || (!x.party_id && normName(x.name) === normName(p.name)));
  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="no-print"><Link to="/parties"><ArrowLeft className="mr-1 h-4 w-4" />All parties</Link></Button>
      <PageHeader title={p.name} description={(p.roles ?? []).map((r) => PARTY_ROLES.find((x) => x.value === r)?.label ?? r).join(", ")} />
      <div className="grid gap-4 rounded-lg border bg-card p-4 text-sm sm:grid-cols-3">
        <Info k="Contact person" v={p.contact_person} />
        <Info k="Phone" v={[p.phone, p.alt_phone].filter(Boolean).join(" / ")} />
        <Info k="City / State" v={[p.city, p.state].filter(Boolean).join(", ")} />
        <Info k="Address" v={p.address} />
        <div><p className="text-muted-foreground">Opening balance</p>
          {p.opening_type === "none" ? <p>None</p> : <p><Money value={p.opening_balance} /> {p.opening_type === "receivable" ? "Receivable" : "Payable"} on {formatDate(p.opening_date)}</p>}
        </div>
        <div><p className="text-muted-foreground">Status</p>{p.is_active ? <StatusBadge tone="success">Active</StatusBadge> : <StatusBadge>Archived</StatusBadge>}</div>
        {p.notes && <div className="sm:col-span-3"><p className="text-muted-foreground">Notes</p><p>{p.notes}</p></div>}
      </div>
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Ledger</h2>
        <LedgerHelp />
        <LedgerTable accountType="party" accountId={p.id} title={`ledger-${p.name}`} />
      </div>
      {linkedTransporters.map((tr) => (
        <div key={tr.id} className="space-y-3">
          <h2 className="text-lg font-semibold">{tr.name} — transporter account</h2>
          <LedgerTable accountType="transporter" accountId={tr.id} title={`transporter-${tr.name}`} />
        </div>
      ))}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Transaction history</h2>
        {transporters.isError
          ? <ErrorState error={transporters.error} onRetry={() => transporters.refetch()} />
          : <PartyHistory partyId={p.id} transporterIds={linkedTransporters.map((x) => x.id)} title={p.name} />}
      </div>
    </div>
  );
}

function Info({ k, v }: { k: string; v?: string | null }) {
  return <div><p className="text-muted-foreground">{k}</p><p>{v || "—"}</p></div>;
}
