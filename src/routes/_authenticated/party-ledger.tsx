import { pageHead } from "@/lib/page-head";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Field, Money, StatusBadge } from "@/components/app/ui";
import { LoadingState, ErrorState, EmptyState } from "@/components/app/states";
import { LedgerTable, LedgerHelp } from "@/components/app/LedgerTable";
import { PeriodPicker, usePeriod } from "@/components/app/PeriodPicker";
import { PartyEntryDialog, PartyManualEntriesList, PartyOpeningDialog, PARTY_CONVENTION } from "@/components/app/PartyLedgerTools";
import { SearchSelect } from "@/components/app/SearchSelect";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTransporters } from "@/lib/lookups";
import { useBusiness } from "@/lib/business";
import { formatDate } from "@/lib/format";
import { normName } from "@/lib/transporter-options";
import { SettlementsPanel } from "./transporter-settlements";

export const Route = createFileRoute("/_authenticated/party-ledger")({
  head: () => pageHead("Party / Transporter Ledger — Gokul Cargo Movers", "Party and transporter ledgers, opening balances, manual entries and monthly statements for Gokul Cargo Movers."),
  component: LedgerPage,
});

function LedgerPage() {
  return (
    <div className="space-y-4">
      <PageHeader title="Party / Transporter Ledger" description="Opening balances, manual entries, monthly statements and the running Receivable / Payable balance. Transporter freight, payments and settlements are in the Transporter tab." />
      <Tabs defaultValue="party">
        <TabsList className="mb-4">
          <TabsTrigger value="party">Party ledger</TabsTrigger>
          <TabsTrigger value="transporter">Transporter ledger &amp; settlements</TabsTrigger>
        </TabsList>
        <TabsContent value="party"><PartyLedger /></TabsContent>
        <TabsContent value="transporter"><SettlementsPanel embedded /></TabsContent>
      </Tabs>
    </div>
  );
}

function PartyLedger() {
  const [partyId, setPartyId] = useState("");
  const { sel, setSel, period } = usePeriod();
  const { role } = useBusiness();
  const canEdit = role === "owner" || role === "admin";
  const [openingDlg, setOpeningDlg] = useState(false);
  const [entryDlg, setEntryDlg] = useState<null | "debit" | "credit">(null);
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
  const from = period.from, to = period.to;
  const hasOpening = !!party && party.opening_type !== "none" && Number(party.opening_balance) > 0;
  return (
    <div className="space-y-4">
      <LedgerHelp />
      {q.isPending ? <LoadingState /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : (
        <>
          <div className="no-print max-w-md">
            <Field label="Party">
              <SearchSelect value={partyId} onChange={setPartyId} allowClear={false} placeholder="Search and choose a party"
                options={q.data.map((p) => ({ value: p.id, label: `${p.name}${p.is_active ? "" : " (archived)"}` }))} />
            </Field>
          </div>
          {party && <PeriodPicker sel={sel} onChange={setSel} period={period} idPrefix="party-period" />}
          {party && !period.error ? (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">{party.name}</h2>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3 text-sm">
                <div>
                  <p className="text-muted-foreground">Opening balance (one record per party)</p>
                  {hasOpening
                    ? <p><Money value={party.opening_balance} /> <StatusBadge tone={party.opening_type === "receivable" ? "success" : "warning"}>{party.opening_type === "receivable" ? "Receivable (debit)" : "Payable (credit)"}</StatusBadge> as on {formatDate(party.opening_date)}</p>
                    : <p>Not set</p>}
                </div>
                {canEdit
                  ? <div className="no-print flex flex-wrap gap-2">
                      <Button variant="outline" onClick={() => setOpeningDlg(true)}>{hasOpening ? "Correct opening balance" : "Set opening balance"}</Button>
                      <Button variant="outline" onClick={() => setEntryDlg("debit")}>Add debit entry</Button>
                      <Button variant="outline" onClick={() => setEntryDlg("credit")}>Add credit entry</Button>
                    </div>
                  : <p className="text-xs text-muted-foreground">Only an Owner or Admin can set opening balances or add manual entries.</p>}
              </div>
              <p className="text-xs text-muted-foreground">{PARTY_CONVENTION}</p>
              <LedgerTable accountType="party" accountId={party.id} from={from} to={to} title={`ledger-${party.name}`} accountName={party.name} />
              {linkedTransporters.map((tr) => <div key={tr.id} className="mt-6"><h3 className="mb-1 font-semibold">{tr.name} — transporter account</h3>
                <p className="mb-2 text-xs text-muted-foreground">Freight Gokul owes this transporter (Payable) and commission Gokul has to receive from this transporter (Receivable).</p>
                <LedgerTable accountType="transporter" accountId={tr.id} from={from} to={to} title={`transporter-${tr.name}`} accountName={tr.name} /></div>)}
              <div className="space-y-2">
                <h3 className="font-semibold">Manual ledger entries</h3>
                <PartyManualEntriesList partyId={party.id} canEdit={canEdit} />
              </div>
              <PartyOpeningDialog open={openingDlg} onOpenChange={setOpeningDlg} party={party} />
              <PartyEntryDialog open={!!entryDlg} onOpenChange={(o) => { if (!o) setEntryDlg(null); }} partyId={party.id} partyName={party.name} defaultSide={entryDlg ?? "debit"} />
            </div>
          ) : !party ? <EmptyState title={q.data.length ? "Choose a party to see its ledger" : "No parties yet"} hint={q.data.length ? undefined : "Add a party first on the Parties page."} /> : null}
        </>
      )}
    </div>
  );
}
