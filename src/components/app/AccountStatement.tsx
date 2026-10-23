import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Money, StatusBadge } from "./ui";
import { selectCls } from "./Section";
import { LoadingState, ErrorState, EmptyState } from "./states";
import { useAccounts, useParties, useTransporters, nameOf, PAYMENT_TYPE } from "@/lib/lookups";
import { downloadCSV, formatDate, maskAccount } from "@/lib/format";

const IN_TYPES = ["customer_receipt", "advance_received", "third_party_receipt"];

/** Bank / cash statement: one account at a time, with opening balance, running balance and closing balance. */
export function AccountStatement() {
  const accounts = useAccounts(); const parties = useParties(); const transporters = useTransporters();
  const [accountId, setAccountId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const q = useQuery({
    queryKey: ["payments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("payments").select("*").order("payment_date", { ascending: false }).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const list = accounts.data ?? [];
  const acct = list.find((a) => a.id === (accountId || list[0]?.id));
  const label = (a: any) => (a.kind === "cash" ? "Cash" : `${a.display_name} ${maskAccount(a.account_number)}`.trim());
  const who = (p: any) => nameOf(transporters.data, p.transporter_id) || nameOf(parties.data, p.party_id) || p.payer_name || "—";

  const st = useMemo(() => {
    if (!acct || !q.data) return null;
    const openDate: string = acct.opening_date ?? "";
    const opening = Number(acct.opening_balance ?? 0);
    // Only live entries of this account dated on/after the opening date, oldest first.
    const all = q.data
      .filter((p) => p.account_id === acct.id && !p.is_reversed && (!openDate || p.payment_date >= openDate))
      .sort((a, b) => (a.payment_date === b.payment_date ? String(a.created_at).localeCompare(String(b.created_at)) : a.payment_date.localeCompare(b.payment_date)));
    const signed = (p: any) => (IN_TYPES.includes(p.payment_type) ? Number(p.amount) : -Number(p.amount));
    const start = all.filter((p) => from && p.payment_date < from).reduce((s, p) => s + signed(p), opening);
    const rows = all.filter((p) => (!from || p.payment_date >= from) && (!to || p.payment_date <= to));
    let run = start;
    const lines = rows.map((p) => { run += signed(p); return { p, deposit: IN_TYPES.includes(p.payment_type) ? Number(p.amount) : 0, withdrawal: IN_TYPES.includes(p.payment_type) ? 0 : Number(p.amount), balance: run }; });
    return {
      lines, start, closing: run, openDate,
      totDep: lines.reduce((s, l) => s + l.deposit, 0), totWd: lines.reduce((s, l) => s + l.withdrawal, 0),
    };
  }, [acct, q.data, from, to]);

  const periodStart = st ? (from && (!st.openDate || from > st.openDate) ? from : st.openDate) : "";

  return (
    <div>
      <div role="search" aria-label="Statement filters" className="list-filters mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <select aria-label="Statement account" className={`${selectCls} sm:col-span-2`} value={acct?.id ?? ""} onChange={(e) => setAccountId(e.target.value)}>
          {list.filter((a) => a.is_active || a.id === acct?.id).map((a) => <option key={a.id} value={a.id}>{label(a)}</option>)}
        </select>
        <Input type="date" aria-label="Statement from date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input type="date" aria-label="Statement to date" value={to} onChange={(e) => setTo(e.target.value)} />
        <Button variant="outline" disabled={!st || !acct} onClick={() => st && acct && downloadCSV(`statement-${label(acct).replace(/\s+/g, "-")}.csv`, [
          ["Date", "Particulars", "Type", "Reference", "Deposit", "Withdrawal", "Balance"],
          [periodStart ? formatDate(periodStart) : "", "Opening balance", "", "", "", "", st.start.toFixed(2)],
          ...st.lines.map(({ p, deposit, withdrawal, balance }) => [formatDate(p.payment_date), who(p), PAYMENT_TYPE[p.payment_type], p.reference || p.txn_reference, deposit ? deposit.toFixed(2) : "", withdrawal ? withdrawal.toFixed(2) : "", balance.toFixed(2)]),
          ["", "Total / Closing balance", "", "", st.totDep.toFixed(2), st.totWd.toFixed(2), st.closing.toFixed(2)],
        ])}>Download statement CSV</Button>
      </div>
      {q.isPending || accounts.isPending ? <LoadingState /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : !acct || !st ? <EmptyState title="No account found" hint="Add a bank account in Business Settings first." /> : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Date</TableHead><TableHead>Particulars</TableHead><TableHead>Reference</TableHead>
              <TableHead className="text-right">Deposit</TableHead><TableHead className="text-right">Withdrawal</TableHead><TableHead className="text-right">Balance</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              <TableRow className="bg-muted/40">
                <TableCell>{periodStart ? formatDate(periodStart) : "—"}</TableCell>
                <TableCell className="font-medium">Opening balance</TableCell><TableCell /><TableCell /><TableCell />
                <TableCell className="text-right font-medium"><Money value={st.start} /></TableCell>
              </TableRow>
              {st.lines.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No entries in this period for this account.</TableCell></TableRow>}
              {st.lines.map(({ p, deposit, withdrawal, balance }) => (
                <TableRow key={p.id}>
                  <TableCell>{formatDate(p.payment_date)}</TableCell>
                  <TableCell>{who(p)}<span className="ml-2"><StatusBadge tone={deposit ? "success" : "warning"}>{PAYMENT_TYPE[p.payment_type]}</StatusBadge></span></TableCell>
                  <TableCell>{p.reference || p.txn_reference || "—"}</TableCell>
                  <TableCell className="text-right">{deposit ? <Money value={deposit} /> : ""}</TableCell>
                  <TableCell className="text-right">{withdrawal ? <Money value={withdrawal} /> : ""}</TableCell>
                  <TableCell className="text-right"><Money value={balance} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={3} className="font-medium">Total / Closing balance</TableCell>
                <TableCell className="text-right"><Money value={st.totDep} /></TableCell>
                <TableCell className="text-right"><Money value={st.totWd} /></TableCell>
                <TableCell className="text-right font-semibold"><Money value={st.closing} /></TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      )}
      <p className="mt-2 text-xs text-muted-foreground">Reversed entries are left out. Entries dated before the account's opening date are not counted. Only Payments &amp; Receipts are included (not trip expenses, advances or salary).</p>
    </div>
  );
}
