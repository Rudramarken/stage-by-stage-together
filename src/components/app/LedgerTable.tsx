import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Money, StatusBadge } from "./ui";
import { LoadingState, ErrorState, EmptyState } from "./states";
import { balanceLabel, formatDate } from "@/lib/format";
import { fetchAllRows } from "@/lib/accounts";
import { exportExcel, exportRows } from "@/lib/export";
import { buildLedgerStatement, statementExport, tableToCsvRows, type LedgerRow } from "@/lib/statement";
import { Link } from "@tanstack/react-router";

type AccountType = "party" | "driver" | "transporter" | "commission";
type Row = LedgerRow & { reference: string; lrId?: string | null; tripId?: string | null };

const chunk = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

/** Reads only the rows of one table that the ledger lines point at (100 ids per request), so nothing is truncated and nothing unrelated is fetched. */
async function lookup(table: string, cols: string, ids: string[]): Promise<Map<string, any>> {
  const out = new Map<string, any>();
  for (const part of chunk(Array.from(new Set(ids)), 100)) {
    const { data, error } = await (supabase as any).from(table).select(`id, ${cols}`).in("id", part);
    if (error) throw new Error(`${table}: ${error.message}`);
    for (const r of data ?? []) out.set(r.id, r);
  }
  return out;
}

const DRIVER_LABELS = { debit: "Driver owes Gokul / salary settled", credit: "Received / Gokul owes driver" };
const CONVENTION: Record<AccountType, string> = {
  party: "Balance = Debit - Credit. Positive = Receivable (party owes Gokul); negative = Payable (Gokul owes the party). Debit = amount owed to Gokul goes up; Credit = a receipt or reduction.",
  transporter: "Balance = Debit - Credit. Negative = Payable (Gokul owes the transporter). Credit = freight payable goes up; Debit = a payment/advance made or commission due from the transporter.",
  commission: "Balance = Debit - Credit. Positive = commission still to be received.",
  driver: "Balance = Debit - Credit. Positive = the driver owes Gokul; negative = Gokul owes the driver (salary due).",
};

export function LedgerTable({ accountType, accountId, from, to, title, accountName }: {
  accountType: AccountType; accountId: string; from?: string; to?: string; title?: string; accountName?: string;
}) {
  const q = useQuery({
    queryKey: ["ledger", accountType, accountId],
    queryFn: async (): Promise<Row[]> => {
      // Every persisted line of this account, read in pages of 1000 (a plain select would silently stop at 1000 rows).
      const rows = await fetchAllRows<any>((a, b) => (supabase as any).from("ledger_entries")
        .select("id, entry_date, description, debit, credit, source_table, source_id, line_kind, created_at")
        .eq("account_type", accountType).eq("account_id", accountId)
        .order("entry_date").order("created_at").order("id").range(a, b));
      const ids = (t: string) => rows.filter((r) => r.source_table === t).map((r) => r.source_id as string);
      const [lrs, pays, pme, tme, advs, exps, sal, coms, recs] = await Promise.all([
        lookup("lrs", "lr_number", ids("lrs")),
        lookup("payments", "reference, txn_reference, lr_id, trip_id", ids("payments")),
        lookup("party_manual_entries", "reference", ids("party_manual_entries")),
        lookup("transporter_manual_entries", "reference", ids("transporter_manual_entries")),
        lookup("advances", "reference, trip_id", ids("advances")),
        lookup("expenses", "reference, trip_id, lr_id", ids("expenses")),
        lookup("salary_payments", "reference", ids("salary_payments")),
        lookup("driver_commissions", "lr_id, trip_id, reference", ids("driver_commissions")),
        lookup("commission_receipts", "commission_id, reference", ids("commission_receipts")),
      ]);
      const comOfReceipt = await lookup("driver_commissions", "lr_id, trip_id, reference", Array.from(recs.values()).map((r) => r.commission_id).filter(Boolean));
      return rows.map((r) => {
        let reference = "", lrId: string | null | undefined, tripId: string | null | undefined;
        switch (r.source_table) {
          case "lrs": reference = lrs.get(r.source_id)?.lr_number ?? ""; lrId = r.source_id; break;
          case "payments": { const p = pays.get(r.source_id); reference = p?.reference || p?.txn_reference || ""; lrId = p?.lr_id; tripId = p?.trip_id; break; }
          case "party_manual_entries": reference = pme.get(r.source_id)?.reference ?? ""; break;
          case "transporter_manual_entries": reference = tme.get(r.source_id)?.reference ?? ""; break;
          case "advances": { const a = advs.get(r.source_id); reference = a?.reference ?? ""; tripId = a?.trip_id; break; }
          case "expenses": { const e = exps.get(r.source_id); reference = e?.reference ?? ""; tripId = e?.trip_id; lrId = e?.lr_id; break; }
          case "salary_payments": reference = sal.get(r.source_id)?.reference ?? ""; break;
          case "driver_commissions": { const c = coms.get(r.source_id); reference = c?.reference ?? ""; lrId = c?.lr_id; tripId = c?.trip_id; break; }
          case "commission_receipts": { const rc = recs.get(r.source_id); const c = rc ? comOfReceipt.get(rc.commission_id) : null; reference = rc?.reference ?? ""; lrId = c?.lr_id; tripId = c?.trip_id; break; }
        }
        return { ...r, reference, lrId, tripId } as Row;
      });
    },
  });

  const st = useMemo(() => (q.data ? buildLedgerStatement<Row>(q.data, from, to) : null), [q.data, from, to]);
  if (q.isPending) return <LoadingState onRetry={() => q.refetch()} />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!st) return null;

  const hasAny = q.data.some((r) => Number(r.debit) !== 0 || Number(r.credit) !== 0);
  if (!hasAny) return <EmptyState title="No ledger entries yet" hint="Entries appear here automatically when opening balances, LRs, payments or advances are saved, or when you add a manual entry." />;

  const isDriver = accountType === "driver";
  const dLabel = isDriver ? DRIVER_LABELS.debit : "Debit", cLabel = isDriver ? DRIVER_LABELS.credit : "Credit";
  const closing = balanceLabel(st.closing);
  const opening = balanceLabel(st.opening);
  const periodText = from || to ? `${from ? formatDate(from) : "start"} to ${to ? formatDate(to) : "latest"}` : "All available history";
  const name = accountName ?? (title ?? "ledger").replace(/^(ledger|transporter)-/, "");
  const fileBase = `${title ?? "ledger"}${from ? `-from-${from}` : ""}${to ? `-to-${to}` : ""}`;
  // CSV and Excel are built from the same statement object as the table below, so the downloads always equal the screen.
  const table = () => statementExport(st, { accountName: name, accountKind: accountType, periodLabel: periodText, debitLabel: dLabel, creditLabel: cLabel, convention: CONVENTION[accountType], referenceOf: (r) => (r as Row).reference });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm">Closing balance: <StatusBadge tone={closing.tone}>{closing.text}</StatusBadge></div>
        <div className="no-print flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => window.print()}>Print</Button>
          <Button variant="outline" size="sm" onClick={() => exportRows(fileBase, tableToCsvRows(table()))}>Download CSV</Button>
          <Button variant="outline" size="sm" onClick={() => exportExcel(fileBase, table())}>Download Excel</Button>
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Date</TableHead><TableHead>Description</TableHead><TableHead>Reference</TableHead>
            <TableHead className="text-right">{dLabel}</TableHead><TableHead className="text-right">{cLabel}</TableHead>
            <TableHead className="text-right">Balance</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            <TableRow className="bg-muted/40">
              <TableCell className="whitespace-nowrap">{from ? formatDate(from) : "—"}</TableCell>
              <TableCell className="font-medium">Opening balance{from ? " (brought forward)" : ""}</TableCell><TableCell /><TableCell /><TableCell />
              <TableCell className="whitespace-nowrap text-right font-medium">{opening.text}</TableCell>
            </TableRow>
            {st.lines.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No entries in this period.</TableCell></TableRow>}
            {st.lines.map(({ row: r, debit, credit, balance }) => (
              <TableRow key={r.id}>
                <TableCell className="whitespace-nowrap">{formatDate(r.entry_date)}</TableCell>
                <TableCell className="whitespace-normal">{r.lrId ? <Link to="/lr/$id" params={{ id: r.lrId }} className="text-info hover:underline">{r.description}</Link> : r.tripId ? <Link to="/trips/$id" params={{ id: r.tripId }} className="text-info hover:underline">{r.description}</Link> : r.description}</TableCell>
                <TableCell>{r.reference || "—"}</TableCell>
                <TableCell className="text-right">{debit ? <Money value={debit} /> : ""}</TableCell>
                <TableCell className="text-right">{credit ? <Money value={credit} /> : ""}</TableCell>
                <TableCell className="whitespace-nowrap text-right">{balanceLabel(balance).text}</TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={3}>Period totals ({st.lines.length} entr{st.lines.length === 1 ? "y" : "ies"})</TableCell>
              <TableCell className="text-right"><Money value={st.totalDebit} /></TableCell>
              <TableCell className="text-right"><Money value={st.totalCredit} /></TableCell>
              <TableCell />
            </TableRow>
            <TableRow>
              <TableCell colSpan={5} className="font-semibold">Closing balance</TableCell>
              <TableCell className="whitespace-nowrap text-right font-semibold">{closing.text}</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground">Closing balance = opening balance + period debits − period credits. {st.rowsAfterPeriod > 0 ? `${st.rowsAfterPeriod} later entr${st.rowsAfterPeriod === 1 ? "y is" : "ies are"} not in this period.` : ""}</p>
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
        <li>Opening balances appear here but are never counted as revenue or expense. A month's opening balance is the balance carried forward from everything before it, not a new entry.</li>
      </ul>
    </details>
  );
}
