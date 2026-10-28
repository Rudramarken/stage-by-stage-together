import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Money, StatusBadge } from "./ui";
import { selectCls } from "./Section";
import { LoadingState, ErrorState, EmptyState } from "./states";
import { useAccounts, useDrivers, useParties, useTransporters, nameOf, PAYMENT_TYPE } from "@/lib/lookups";
import { accountLabel, buildStatement, useAccountBalances, useAccountMovements, useUnassignedOutflows, type Movement } from "@/lib/accounts";
import { downloadCSV, formatDate, formatINR } from "@/lib/format";

const SOURCE_LABEL: Record<string, string> = { expense: "Expense", advance: "Advance", salary_payment: "Salary", commission_receipt: "Commission receipt" };
const typeLabel = (m: Movement) => PAYMENT_TYPE[m.source_type] ?? SOURCE_LABEL[m.source_type] ?? m.source_type;

/** One account at a time: opening balance, every movement through that account, running and closing balance. The total position sums the separate accounts. */
export function AccountStatement() {
  const accounts = useAccounts(); const parties = useParties(); const transporters = useTransporters(); const drivers = useDrivers();
  const balances = useAccountBalances(); const unassigned = useUnassignedOutflows();
  const [accountId, setAccountId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const list = accounts.data ?? [];
  const acct = list.find((a) => a.id === (accountId || list[0]?.id));
  const mq = useAccountMovements(acct?.id);
  const who = (m: Movement) => nameOf(transporters.data, m.transporter_id) || nameOf(parties.data, m.party_id) || nameOf(drivers.data, m.driver_id) || m.other_name || "—";

  const st = useMemo(() => (acct && mq.data ? buildStatement(Number(acct.opening_balance ?? 0), acct.opening_date, mq.data, from, to) : null), [acct, mq.data, from, to]);
  const openDate: string = acct?.opening_date ?? "";
  const periodStart = st ? (from && (!openDate || from > openDate) ? from : openDate) : "";
  const total = (balances.data ?? []).reduce((s, b) => s + Number(b.balance), 0);
  const before = balances.data?.find((b) => b.account_id === acct?.id)?.entries_before_opening ?? 0;

  return (
    <div>
      {balances.data && (
        <div className="mb-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4" aria-label="Account balances">
          {list.filter((a) => a.is_active || Number(balances.data!.find((b) => b.account_id === a.id)?.balance ?? 0) !== 0).map((a) => (
            <button key={a.id} type="button" onClick={() => setAccountId(a.id)} className={`rounded-lg border bg-card p-3 text-left ${a.id === acct?.id ? "ring-2 ring-primary" : ""}`}>
              <div className="text-xs text-muted-foreground">{accountLabel(a)}{a.is_active ? "" : " (inactive)"}</div>
              <div className="text-lg font-semibold"><Money value={balances.data!.find((b) => b.account_id === a.id)?.balance ?? 0} /></div>
            </button>
          ))}
          <div className="rounded-lg border bg-muted p-3"><div className="text-xs text-muted-foreground">Total cash + bank (sum of the accounts above)</div><div className="text-lg font-semibold"><Money value={total} /></div></div>
        </div>
      )}
      {balances.isError && <ErrorState error={balances.error} onRetry={() => balances.refetch()} />}
      {unassigned.data && unassigned.data.length > 0 && (
        <p role="status" className="mb-4 rounded border border-warning/40 bg-warning/10 p-2 text-sm">
          Provisional balances: {unassigned.data.map((u) => `${u.source} ${u.entries} entr${Number(u.entries) === 1 ? "y" : "ies"} (${formatINR(u.amount)})`).join("; ")} were paid without choosing a cash/bank account, so no account includes them. Open the entry and choose the account to include it.
        </p>
      )}
      <div role="search" aria-label="Statement filters" className="list-filters mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <select aria-label="Statement account" className={`${selectCls} sm:col-span-2`} value={acct?.id ?? ""} onChange={(e) => setAccountId(e.target.value)}>
          {list.filter((a) => a.is_active || a.id === acct?.id).map((a) => <option key={a.id} value={a.id}>{accountLabel(a)}</option>)}
        </select>
        <Input type="date" aria-label="Statement from date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input type="date" aria-label="Statement to date" value={to} onChange={(e) => setTo(e.target.value)} />
        <Button variant="outline" disabled={!st || !acct} onClick={() => st && acct && downloadCSV(`statement-${accountLabel(acct).replace(/\s+/g, "-")}.csv`, [
          ["Date", "Particulars", "Type", "Reference", "Deposit", "Withdrawal", "Balance"],
          [periodStart ? formatDate(periodStart) : "", "Opening balance", "", "", "", "", st.start.toFixed(2)],
          ...st.lines.map(({ m, deposit, withdrawal, balance }) => [formatDate(m.movement_date), who(m), typeLabel(m), m.reference, deposit ? deposit.toFixed(2) : "", withdrawal ? withdrawal.toFixed(2) : "", balance.toFixed(2)]),
          ["", "Total / Closing balance", "", "", st.totDeposit.toFixed(2), st.totWithdrawal.toFixed(2), st.closing.toFixed(2)],
        ])}>Download statement CSV</Button>
      </div>
      {mq.isPending && acct ? <LoadingState /> : mq.isError ? <ErrorState error={mq.error} onRetry={() => mq.refetch()} /> : accounts.isPending ? <LoadingState /> : !acct || !st ? <EmptyState title="No account found" hint="Add a bank account in Business Settings first." /> : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Date</TableHead><TableHead>Particulars</TableHead><TableHead>Reference</TableHead>
              <TableHead className="text-right">Deposit</TableHead><TableHead className="text-right">Withdrawal</TableHead><TableHead className="text-right">Balance</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              <TableRow className="bg-muted/40">
                <TableCell>{periodStart ? formatDate(periodStart) : "—"}</TableCell>
                <TableCell className="font-medium">Opening balance{from && (!openDate || from > openDate) ? " (balance brought forward)" : ""}</TableCell><TableCell /><TableCell /><TableCell />
                <TableCell className="text-right font-medium"><Money value={st.start} /></TableCell>
              </TableRow>
              {st.lines.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No entries in this period for this account.</TableCell></TableRow>}
              {st.lines.map(({ m, deposit, withdrawal, balance }) => (
                <TableRow key={`${m.source_table}-${m.source_id}`}>
                  <TableCell>{formatDate(m.movement_date)}</TableCell>
                  <TableCell>{who(m)}<span className="ml-2"><StatusBadge tone={deposit ? "success" : "warning"}>{typeLabel(m)}</StatusBadge></span></TableCell>
                  <TableCell>{m.reference || "—"}</TableCell>
                  <TableCell className="text-right">{deposit ? <Money value={deposit} /> : ""}</TableCell>
                  <TableCell className="text-right">{withdrawal ? <Money value={withdrawal} /> : ""}</TableCell>
                  <TableCell className="text-right"><Money value={balance} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={3} className="font-medium">Total / Closing balance</TableCell>
                <TableCell className="text-right"><Money value={st.totDeposit} /></TableCell>
                <TableCell className="text-right"><Money value={st.totWithdrawal} /></TableCell>
                <TableCell className="text-right font-semibold"><Money value={st.closing} /></TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      )}
      {before > 0 && <p role="status" className="mt-2 text-sm text-warning-foreground">{before} entr{before === 1 ? "y is" : "ies are"} dated before this account's opening date and {before === 1 ? "is" : "are"} not counted. Correct the opening date in Business Settings if that is wrong.</p>}
      <p className="mt-2 text-xs text-muted-foreground">Closing balance = opening balance + deposits − withdrawals. Included once each: payments &amp; receipts, trip/LR expenses paid by Gokul, advances, salary payments and commission cash receipts that have this account selected. Reversed and cancelled entries are left out. Entries dated before the opening date are not counted.</p>
    </div>
  );
}
