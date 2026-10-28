import { pageHead } from "@/lib/page-head";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { PageHeader, Field, Money, StatusBadge } from "@/components/app/ui";
import { LoadingState, ErrorState, EmptyState } from "@/components/app/states";
import { PeriodPicker, usePeriod } from "@/components/app/PeriodPicker";
import { SearchSelect } from "@/components/app/SearchSelect";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useParties, useTransporters } from "@/lib/lookups";
import { formatDate, balanceLabel } from "@/lib/format";
import { exportExcel, exportRows } from "@/lib/export";
import { balanceWords, tableToCsvRows, type Cell } from "@/lib/statement";
import { assembleHistory, loadHistory, resolveAccounts, type EntityKind } from "@/lib/party-history";

export const Route = createFileRoute("/_authenticated/history")({
  head: () => pageHead("Party / Transporter History — Gokul Cargo Movers", "Complete history of work done with one party or transporter: LRs, trips, vehicles, payments, ledger and balances."),
  component: HistoryPage,
});

const PAGE = 50;

function HistoryPage() {
  const parties = useParties(); const transporters = useTransporters();
  const [sel, setSel] = useState(""); // "party:<id>" | "transporter:<id>"
  const { sel: psel, setSel: setPsel, period } = usePeriod("all");
  const [page, setPage] = useState(0);
  const [lrPage, setLrPage] = useState(0);

  const options = useMemo(() => [
    ...(parties.data ?? []).map((p) => ({ value: `party:${p.id}`, label: p.name, hint: `Party${p.is_active ? "" : " · archived"}` })),
    ...(transporters.data ?? []).map((t) => ({ value: `transporter:${t.id}`, label: t.name, hint: "Transporter" })),
  ], [parties.data, transporters.data]);

  const [kind, id] = sel ? (sel.split(":") as [EntityKind, string]) : [null, ""];
  const acc = useMemo(() => (kind && parties.data && transporters.data ? resolveAccounts({ kind, id }, parties.data, transporters.data) : null), [kind, id, parties.data, transporters.data]);
  const accKey = acc ? [...acc.parties.map((p) => p.id), ...acc.transporters.map((t) => t.id)].join(",") : "";
  const raw = useQuery({ queryKey: ["party-history", accKey], enabled: !!acc && (acc.parties.length + acc.transporters.length) > 0, queryFn: () => loadHistory(acc!) });
  const h = useMemo(() => (raw.data && !period.error ? assembleHistory(raw.data, period.from, period.to) : null), [raw.data, period.from, period.to, period.error]);

  const title = acc ? [...new Set([...acc.parties.map((p) => p.name), ...acc.transporters.map((t) => t.name)])].join(" / ") : "";
  const roleText = acc ? [acc.parties.length ? "Party" : "", acc.transporters.length ? "Transporter" : ""].filter(Boolean).join(" + ") : "";

  // One export = exactly the rows on screen for the chosen period (every page, not only the visible one).
  const buildExport = () => {
    if (!h) return null;
    const rows: Cell[][] = [
      ["Party / Transporter History"], ["Name", title], ["Role", roleText], ["Period", period.label], ["Convention", "Balance = Debit - Credit. Receivable = they owe Gokul; Payable = Gokul owes them."], [],
      ["ACCOUNT SUMMARY"], ["Account", "Name", "Opening balance (INR)", "Period debit (INR)", "Period credit (INR)", "Closing balance (INR)", "Closing type"],
      ...h.statements.map((s) => [s.label, s.name, Math.abs(s.st.opening), s.st.totalDebit, s.st.totalCredit, Math.abs(s.st.closing), balanceWords(s.st.closing)] as Cell[]),
      [], ["COMMISSION (transporter commission records)"], ["Earned (INR)", "Received (INR)", "Pending (INR)"], [h.commission.earned, h.commission.received, h.commission.pending], [],
      ["TRANSACTIONS (ledger, chronological)"],
      ["Date", "Account", "Account name", "Type", "Description", "Reference", "LR / Bilty", "Trip", "Vehicle", "Driver", "Route", "Consignor", "Consignee", "Debit (INR)", "Credit (INR)", "Account balance after entry (INR)", "Balance type"],
      ...h.tx.map((r) => [formatDate(r.date), r.account, r.accountName, r.kind, r.description, r.reference, r.lrNo, r.tripNo, r.vehicle, r.driver, r.route, r.consignors, r.consignees, r.debit || "", r.credit || "", Math.abs(r.balance), balanceWords(r.balance)] as Cell[]),
      ["", "", "", "", "Total of the rows above", "", "", "", "", "", "", "", "", h.tx.reduce((s, r) => s + r.debit, 0), h.tx.reduce((s, r) => s + r.credit, 0), "", ""],
      [], ["LR / BILTY AND TRIPS LINKED TO THIS NAME"],
      ["Date", "LR / Bilty", "Role", "Trip", "Vehicle", "Driver", "Route", "Consignor", "Consignee", "Party freight share (INR)", "LR freight (INR)", "Freight payable to transporter (INR)", "Commission (INR)", "LR-level expenses (INR)", "Trip expenses - whole trip, info (INR)", "Trip driver advance - whole trip, info (INR)", "Status", "Delivery"],
      ...h.lrRows.map((l) => [formatDate(l.date), l.lrNo, l.roles, l.tripNo, l.vehicle, l.driver, l.route, l.consignors, l.consignees, l.shareFreight, l.lrFreight, l.payable, l.commission, l.lrExpenses, l.tripExpenses, l.tripDriverAdvance, l.status, l.delivery] as Cell[]),
      [], ["NOTES"], ...h.limits.map((x) => [x] as Cell[]),
    ];
    return { rows, moneyCols: Array.from({ length: 18 }, (_, i) => i), sheetName: "History" };
  };
  const fileBase = `history-${title}${period.from ? `-from-${period.from}` : ""}${period.to ? `-to-${period.to}` : ""}`;

  const txPage = h ? h.tx.slice(page * PAGE, page * PAGE + PAGE) : [];
  const lrSlice = h ? h.lrRows.slice(lrPage * PAGE, lrPage * PAGE + PAGE) : [];
  const dTot = h ? h.tx.reduce((s, r) => s + r.debit, 0) : 0, cTot = h ? h.tx.reduce((s, r) => s + r.credit, 0) : 0;

  return (
    <div className="space-y-5">
      <PageHeader title="Party / Transporter History" description="Search one name to see everything done with it: LR / Bilty, trips, vehicles, payments, ledger entries and balances. Download the full result as CSV or Excel." />
      {(parties.isError || transporters.isError) && <ErrorState error={parties.error ?? transporters.error} onRetry={() => { parties.refetch(); transporters.refetch(); }} />}
      <div className="no-print max-w-md">
        <Field label="Party or transporter">
          <SearchSelect value={sel} onChange={(v) => { setSel(v); setPage(0); setLrPage(0); }} options={options} allowClear={false} placeholder="Search by name" />
        </Field>
      </div>
      {acc?.note && <p className="text-sm text-muted-foreground">{acc.note}</p>}
      {!sel ? <EmptyState title="Choose a party or transporter" hint="Type a name in the box above." /> : (
        <>
          <PeriodPicker sel={psel} onChange={(s) => { setPsel(s); setPage(0); setLrPage(0); }} period={period} idPrefix="history-period" />
          {raw.isPending && !!acc ? <LoadingState label="Loading every linked record…" onRetry={() => raw.refetch()} /> : raw.isError ? <ErrorState error={raw.error} onRetry={() => raw.refetch()} /> : !h ? null : (
            <>
              <div className="no-print flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold">{title} <span className="text-sm font-normal text-muted-foreground">({roleText})</span></h2>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => { const t = buildExport(); if (t) exportRows(fileBase, tableToCsvRows(t)); }}>Download CSV (all rows)</Button>
                  <Button variant="outline" size="sm" onClick={() => { const t = buildExport(); if (t) exportExcel(fileBase, t); }}>Download Excel (all rows)</Button>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {h.statements.map((s) => { const c = balanceLabel(s.st.closing); return (
                  <div key={s.label + s.name} className="rounded-lg border bg-card p-4 text-sm">
                    <p className="font-semibold">{s.label} — {s.name}</p>
                    <dl className="mt-2 grid grid-cols-2 gap-1">
                      <dt className="text-muted-foreground">Opening balance</dt><dd className="text-right">{balanceLabel(s.st.opening).text}</dd>
                      <dt className="text-muted-foreground">Period debit</dt><dd className="text-right"><Money value={s.st.totalDebit} /></dd>
                      <dt className="text-muted-foreground">Period credit</dt><dd className="text-right"><Money value={s.st.totalCredit} /></dd>
                      <dt className="font-medium">Closing balance</dt><dd className="text-right"><StatusBadge tone={c.tone}>{c.text}</StatusBadge></dd>
                    </dl>
                  </div>); })}
                <div className="rounded-lg border bg-card p-4 text-sm">
                  <p className="font-semibold">Commission (transporter)</p>
                  <dl className="mt-2 grid grid-cols-2 gap-1">
                    <dt className="text-muted-foreground">Earned</dt><dd className="text-right"><Money value={h.commission.earned} /></dd>
                    <dt className="text-muted-foreground">Received</dt><dd className="text-right"><Money value={h.commission.received} /></dd>
                    <dt className="text-muted-foreground">Pending</dt><dd className="text-right"><Money value={h.commission.pending} /></dd>
                  </dl>
                </div>
              </div>

              <h3 className="font-semibold">Transactions ({h.tx.length})</h3>
              {h.tx.length === 0 ? <EmptyState title="No transactions in this period" hint="Choose All available history or a wider period." /> : (
                <div className="overflow-x-auto rounded-lg border bg-card">
                  <Table>
                    <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Account</TableHead><TableHead>Type</TableHead><TableHead>Description</TableHead><TableHead>Reference</TableHead><TableHead>LR / Bilty</TableHead><TableHead>Trip</TableHead><TableHead>Vehicle / Driver</TableHead><TableHead>Route</TableHead><TableHead>Consignor → Consignee</TableHead><TableHead className="text-right">Debit</TableHead><TableHead className="text-right">Credit</TableHead><TableHead className="text-right">Balance</TableHead></TableRow></TableHeader>
                    <TableBody>{txPage.map((r) => (
                      <TableRow key={r.key}>
                        <TableCell className="whitespace-nowrap">{formatDate(r.date)}</TableCell><TableCell>{r.account}</TableCell><TableCell className="whitespace-normal">{r.kind}</TableCell>
                        <TableCell className="max-w-56 whitespace-normal">{r.description}</TableCell><TableCell>{r.reference || "—"}</TableCell>
                        <TableCell>{r.lrId ? <Link to="/lr/$id" params={{ id: r.lrId }} className="text-info hover:underline">{r.lrNo || "View LR"}</Link> : "—"}</TableCell>
                        <TableCell>{r.tripId ? <Link to="/trips/$id" params={{ id: r.tripId }} className="text-info hover:underline">{r.tripNo || "View trip"}</Link> : "—"}</TableCell>
                        <TableCell className="whitespace-normal">{r.vehicle || "—"}{r.driver ? <span className="block text-xs text-muted-foreground">{r.driver}</span> : null}</TableCell>
                        <TableCell className="max-w-40 whitespace-normal">{r.route || "—"}</TableCell>
                        <TableCell className="max-w-48 whitespace-normal">{r.consignors || r.consignees ? `${r.consignors || "—"} → ${r.consignees || "—"}` : "—"}</TableCell>
                        <TableCell className="text-right">{r.debit ? <Money value={r.debit} /> : ""}</TableCell><TableCell className="text-right">{r.credit ? <Money value={r.credit} /> : ""}</TableCell>
                        <TableCell className="whitespace-nowrap text-right">{balanceLabel(r.balance).text}</TableCell>
                      </TableRow>))}</TableBody>
                    <TableFooter><TableRow><TableCell colSpan={10}>Total of all {h.tx.length} transactions (all pages)</TableCell><TableCell className="text-right"><Money value={dTot} /></TableCell><TableCell className="text-right"><Money value={cTot} /></TableCell><TableCell /></TableRow></TableFooter>
                  </Table>
                  <Pager page={page} setPage={setPage} total={h.tx.length} />
                </div>
              )}

              <h3 className="font-semibold">LR / Bilty and trips linked to this name ({h.lrRows.length})</h3>
              {h.lrRows.length === 0 ? <EmptyState title="No LR / Bilty linked in this period" /> : (
                <div className="overflow-x-auto rounded-lg border bg-card">
                  <Table>
                    <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>LR / Bilty</TableHead><TableHead>Role</TableHead><TableHead>Trip</TableHead><TableHead>Vehicle / Driver</TableHead><TableHead>Route</TableHead><TableHead>Consignor → Consignee</TableHead><TableHead className="text-right">Party freight share</TableHead><TableHead className="text-right">LR freight</TableHead><TableHead className="text-right">Payable to transporter</TableHead><TableHead className="text-right">Commission</TableHead><TableHead className="text-right">LR expenses</TableHead><TableHead className="text-right">Trip expenses (info)</TableHead><TableHead className="text-right">Trip driver advance (info)</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                    <TableBody>{lrSlice.map((l) => (
                      <TableRow key={l.id} className={l.status === "Cancelled" ? "opacity-60" : ""}>
                        <TableCell className="whitespace-nowrap">{formatDate(l.date)}</TableCell><TableCell><Link to="/lr/$id" params={{ id: l.id }} className="text-info hover:underline">{l.lrNo}</Link></TableCell>
                        <TableCell className="whitespace-normal">{l.roles}</TableCell>
                        <TableCell>{l.tripId ? <Link to="/trips/$id" params={{ id: l.tripId }} className="text-info hover:underline">{l.tripNo || "View trip"}</Link> : "—"}</TableCell>
                        <TableCell className="whitespace-normal">{l.vehicle || "—"}{l.driver ? <span className="block text-xs text-muted-foreground">{l.driver}</span> : null}</TableCell>
                        <TableCell className="max-w-40 whitespace-normal">{l.route || "—"}</TableCell>
                        <TableCell className="max-w-48 whitespace-normal">{l.consignors || "—"} → {l.consignees || "—"}</TableCell>
                        <TableCell className="text-right"><Money value={l.shareFreight} /></TableCell><TableCell className="text-right"><Money value={l.lrFreight} /></TableCell><TableCell className="text-right"><Money value={l.payable} /></TableCell>
                        <TableCell className="text-right"><Money value={l.commission} /></TableCell><TableCell className="text-right"><Money value={l.lrExpenses} /></TableCell>
                        <TableCell className="text-right text-muted-foreground"><Money value={l.tripExpenses} /></TableCell><TableCell className="text-right text-muted-foreground"><Money value={l.tripDriverAdvance} /></TableCell>
                        <TableCell><StatusBadge tone={l.status === "Cancelled" ? "danger" : "success"}>{l.status}</StatusBadge></TableCell>
                      </TableRow>))}</TableBody>
                  </Table>
                  <Pager page={lrPage} setPage={setLrPage} total={h.lrRows.length} />
                </div>
              )}
              <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">{h.limits.map((x) => <li key={x}>{x}</li>)}</ul>
            </>
          )}
        </>
      )}
    </div>
  );
}

function Pager({ page, setPage, total }: { page: number; setPage: (p: number) => void; total: number }) {
  return (
    <div className="no-print flex items-center justify-between border-t px-3 py-2 text-sm text-muted-foreground">
      <span>{total === 0 ? 0 : page * PAGE + 1}–{Math.min((page + 1) * PAGE, total)} of {total}. Downloads include all {total} rows.</span>
      <div className="flex gap-2"><Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button><Button variant="outline" size="sm" disabled={(page + 1) * PAGE >= total} onClick={() => setPage(page + 1)}>Next</Button></div>
    </div>
  );
}
