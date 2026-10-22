import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Money, StatusBadge } from "./ui";
import { LoadingState, ErrorState, EmptyState } from "./states";
import { balanceLabel, downloadCSV, formatDate } from "@/lib/format";
import { Link } from "@tanstack/react-router";

export function LedgerTable({ accountType, accountId, from, to, title }: {
  accountType: "party" | "driver" | "transporter" | "commission"; accountId: string; from?: string; to?: string; title?: string;
}) {
  const q = useQuery({
    queryKey: ["ledger", accountType, accountId],
    queryFn: async () => {
      const { data, error } = await supabase.from("ledger_entries")
        .select("id, entry_date, description, debit, credit, source_table, source_id, line_kind, created_at")
        .eq("account_type", accountType).eq("account_id", accountId)
        .order("entry_date").order("created_at");
      if (error) throw error;
      const commissions = await supabase.from("driver_commissions").select("id, lr_id, trip_id");
      const receipts = await supabase.from("commission_receipts").select("id, commission_id");
      if (commissions.error) throw commissions.error;
      if (receipts.error) throw receipts.error;
      return data.map((r) => {
        const commissionId = r.source_table === "driver_commissions" ? r.source_id : receipts.data?.find((x) => x.id === r.source_id)?.commission_id;
        const c = commissions.data?.find((x) => x.id === commissionId);
        return { ...r, lrId: r.source_table === "lrs" ? r.source_id : c?.lr_id, tripId: c?.trip_id };
      });
    },
  });
  if (q.isPending) return <LoadingState onRetry={() => q.refetch()} />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;

  const all = q.data.filter((r) => Number(r.debit) !== 0 || Number(r.credit) !== 0);
  const before = all.filter((r) => from && r.entry_date < from);
  const opening = before.reduce((s, r) => s + Number(r.debit) - Number(r.credit), 0);
  const rows = all.filter((r) => (!from || r.entry_date >= from) && (!to || r.entry_date <= to));
  let run = opening;
  const withRun = rows.map((r) => { run += Number(r.debit) - Number(r.credit); return { ...r, run }; });
  const totD = rows.reduce((s, r) => s + Number(r.debit), 0);
  const totC = rows.reduce((s, r) => s + Number(r.credit), 0);
  const closing = balanceLabel(run);

  if (all.length === 0) return <EmptyState title="No ledger entries yet" hint="Entries appear here automatically when opening balances, LRs, payments or advances are saved." />;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm">Closing balance: <StatusBadge tone={closing.tone}>{closing.text}</StatusBadge></div>
        <div className="no-print flex gap-2">
          <Button variant="outline" size="sm" onClick={() => window.print()}>Print</Button>
          <Button variant="outline" size="sm" onClick={() => downloadCSV(`${title ?? "ledger"}.csv`, [
            ["Date", "Description", accountType === "driver" ? "Driver owes Gokul / salary settled" : "Debit", accountType === "driver" ? "Received / Gokul owes driver" : "Credit", "Running balance"],
            ["", "Opening balance", "", "", opening.toFixed(2)],
            ...withRun.map((r) => [formatDate(r.entry_date), r.description, Number(r.debit).toFixed(2), Number(r.credit).toFixed(2), r.run.toFixed(2)]),
            ["", "Total", totD.toFixed(2), totC.toFixed(2), run.toFixed(2)],
          ])}>Download CSV</Button>
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Date</TableHead><TableHead>Description</TableHead>
            <TableHead className="text-right">{accountType === "driver" ? "Driver owes Gokul / salary settled" : "Debit"}</TableHead><TableHead className="text-right">{accountType === "driver" ? "Received / salary due" : "Credit"}</TableHead>
            <TableHead className="text-right">Balance</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {from && <TableRow><TableCell /><TableCell className="italic">Balance before {formatDate(from)}</TableCell><TableCell /><TableCell /><TableCell className="text-right">{balanceLabel(opening).text}</TableCell></TableRow>}
            {withRun.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="whitespace-nowrap">{formatDate(r.entry_date)}</TableCell>
                <TableCell>{r.lrId ? <Link to="/lr/$id" params={{ id: r.lrId }} className="text-info hover:underline">{r.description}</Link> : r.tripId ? <Link to="/trips/$id" params={{ id: r.tripId }} className="text-info hover:underline">{r.description}</Link> : r.description}</TableCell>
                <TableCell className="text-right">{Number(r.debit) ? <Money value={r.debit} /> : ""}</TableCell>
                <TableCell className="text-right">{Number(r.credit) ? <Money value={r.credit} /> : ""}</TableCell>
                <TableCell className="whitespace-nowrap text-right">{balanceLabel(r.run).text}</TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter><TableRow>
            <TableCell colSpan={2}>Total</TableCell>
            <TableCell className="text-right"><Money value={totD} /></TableCell>
            <TableCell className="text-right"><Money value={totC} /></TableCell>
            <TableCell className="text-right">{closing.text}</TableCell>
          </TableRow></TableFooter>
        </Table>
      </div>
    </div>
  );
}

export function LedgerHelp() {
  return (
    <details className="no-print rounded-md border bg-card p-3 text-sm">
      <summary className="cursor-pointer font-medium">How to read this ledger</summary>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
        <li><b>Debit</b> = the amount owed <b>to Gokul</b> goes up (receivable), or a payment Gokul made reduces what Gokul owes.</li>
        <li><b>Credit</b> = the amount <b>Gokul owes</b> goes up (payable), or a receipt reduces what the party owes.</li>
        <li>You don't need to read debit/credit: every balance is labelled <b>Receivable</b> (they owe Gokul) or <b>Payable</b> (Gokul owes them).</li>
        <li>Opening balances appear here but are never counted as revenue or expense.</li>
      </ul>
    </details>
  );
}
