import { pageHead } from "@/lib/page-head";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Field } from "@/components/app/ui";
import { LoadingState, ErrorState, EmptyState } from "@/components/app/states";
import { LedgerTable, LedgerHelp } from "@/components/app/LedgerTable";
import { Input } from "@/components/ui/input";
import { useTransporters } from "@/lib/lookups";
import { normName } from "@/lib/transporter-options";

export const Route = createFileRoute("/_authenticated/party-ledger")({
  head: () => pageHead("Party Ledger — Gokul Cargo Movers", "Party Ledger records for Gokul Cargo Movers transport management."),
  component: PartyLedger,
});

function PartyLedger() {
  const [partyId, setPartyId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const q = useQuery({
    queryKey: ["parties"],
    queryFn: async () => {
      const { data, error } = await supabase.from("parties").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });
  const party = q.data?.find((p) => p.id === partyId);
  // A party that is also a transporter: its transporter account (freight payable, commission due from the transporter) is shown below too.
  const transporters = useTransporters();
  const linkedTransporters = party ? ((transporters.data ?? []) as any[]).filter((x) => x.party_id === party.id || (!x.party_id && normName(x.name) === normName(party.name))) : [];
  return (
    <div className="space-y-4">
      <PageHeader title="Party Ledger" description="Every entry for one party, with a running Receivable / Payable balance." />
      <LedgerHelp />
      {q.isPending ? <LoadingState /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : (
        <>
          <div className="no-print grid gap-3 sm:grid-cols-3">
            <Field label="Party">
              <select className="h-9 rounded-md border border-input bg-card px-2 text-sm" value={partyId} onChange={(e) => setPartyId(e.target.value)}>
                <option value="">— Choose a party —</option>
                {q.data.map((p) => <option key={p.id} value={p.id}>{p.name}{p.is_active ? "" : " (archived)"}</option>)}
              </select>
            </Field>
            <Field label="From date"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
            <Field label="To date"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
          </div>
          {party ? (
            <div><h2 className="mb-2 text-lg font-semibold">{party.name}</h2>
              <LedgerTable accountType="party" accountId={party.id} from={from || undefined} to={to || undefined} title={`ledger-${party.name}`} />
              {linkedTransporters.map((tr) => <div key={tr.id} className="mt-6"><h3 className="mb-1 font-semibold">{tr.name} — transporter account</h3>
                <p className="mb-2 text-xs text-muted-foreground">Freight Gokul owes this transporter (Payable) and commission Gokul has to receive from this transporter (Receivable).</p>
                <LedgerTable accountType="transporter" accountId={tr.id} from={from || undefined} to={to || undefined} title={`transporter-${tr.name}`} /></div>)}</div>
          ) : <EmptyState title={q.data.length ? "Choose a party to see its ledger" : "No parties yet"} hint={q.data.length ? undefined : "Add a party first on the Parties page."} />}
        </>
      )}
    </div>
  );
}
