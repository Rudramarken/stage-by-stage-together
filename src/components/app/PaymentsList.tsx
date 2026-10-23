import { Eye } from "lucide-react";
import { RowActions, actionCell } from "./RowActions";
import { MobileCards, MobileCard, dateRangeCls } from "./MobileCards";
import { RemovalDialog, type RemovalTarget } from "./RemovalDialog";
import { RecordDetails } from "./RecordDetails";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, Plus, Undo2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader, Money, StatusBadge } from "./ui";
import { selectCls } from "./Section";
import { LoadingState, ErrorState, EmptyState, errorMessage } from "./states";
import { PaymentDialog } from "./PaymentDialog";
import { useAccounts, useAccountBalances, useAccountMovements, useParties, useTransporters, nameOf, PAYMENT_TYPE } from "@/lib/lookups";
import { downloadCSV, formatDate, formatINR, maskAccount } from "@/lib/format";

export function PaymentsList({ thirdParty, transporterId }: { thirdParty?: boolean; transporterId?: string }) {
  const [removal, setRemoval] = useState<RemovalTarget | null>(null);
  const [viewing, setViewing] = useState<any>(null);
  const accounts = useAccounts(); const parties = useParties(); const transporters = useTransporters();
  const [f, setF] = useState({ search: "", account: "", kind: "", from: "", to: "", party: "" });
  const [dlg, setDlg] = useState<{ open: boolean; row: any }>({ open: false, row: null });
  const q = useQuery({
    queryKey: ["payments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("payments").select("*").order("payment_date", { ascending: false }).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const isIn = (t: string) => ["customer_receipt", "advance_received", "third_party_receipt"].includes(t);
  const rows = useMemo(() => (q.data ?? []).filter((p) => {
    if (transporterId && (p.transporter_id !== transporterId || p.payment_type !== "transporter_payment")) return false;
    if (thirdParty ? p.payment_type !== "third_party_receipt" : false) return false;
    if (f.account && p.account_id !== f.account) return false;
    if (f.kind === "in" && !isIn(p.payment_type)) return false;
    if (f.kind === "out" && isIn(p.payment_type)) return false;
    if (f.party && p.party_id !== f.party) return false;
    if (f.from && p.payment_date < f.from) return false;
    if (f.to && p.payment_date > f.to) return false;
    const s = f.search.trim().toLowerCase();
    return !s || [p.reference, p.payer_name, p.txn_reference, nameOf(parties.data, p.party_id), nameOf(transporters.data, p.transporter_id)].join(" ").toLowerCase().includes(s);
  }), [q.data, f, thirdParty, transporterId, parties.data, transporters.data]);
  const balances = useAccountBalances(); const moves = useAccountMovements();
  const showBalances = !thirdParty && !transporterId;
  const sel = accounts.data?.find((a) => a.id === f.account);
  // Statement summary for the selected account over the chosen dates: opening (at From date) + in - out = closing.
  const stmt = useMemo(() => {
    if (!sel || !moves.data) return null;
    const od: string | null = sel.opening_date;
    const mine = moves.data.filter((m) => m.account_id === sel.id && (!od || (m.entry_date ?? "") >= od));
    const openAt = Number(sel.opening_balance ?? 0) + mine.filter((m) => f.from && (m.entry_date ?? "") < f.from).reduce((s, m) => s + Number(m.signed_amount), 0);
    const inRange = mine.filter((m) => (!f.from || (m.entry_date ?? "") >= f.from) && (!f.to || (m.entry_date ?? "") <= f.to));
    const rin = inRange.filter((m) => Number(m.signed_amount) > 0).reduce((s, m) => s + Number(m.signed_amount), 0);
    const rout = -inRange.filter((m) => Number(m.signed_amount) < 0).reduce((s, m) => s + Number(m.signed_amount), 0);
    return { open: openAt, rin, rout, close: openAt + rin - rout, openLabel: f.from && (!od || f.from > od) ? formatDate(f.from) : od ? formatDate(od) : "start" };
  }, [sel, moves.data, f.from, f.to]);
  const live = rows.filter((r) => !r.is_reversed);
  const totIn = live.filter((r) => isIn(r.payment_type)).reduce((s, r) => s + Number(r.amount), 0);
  const totOut = live.filter((r) => !isIn(r.payment_type)).reduce((s, r) => s + Number(r.amount), 0);
  const who = (p: any) => nameOf(transporters.data, p.transporter_id) || nameOf(parties.data, p.party_id);
  const acct = (id: string) => { const a = accounts.data?.find((x) => x.id === id); return a ? (a.kind === "cash" ? "Cash" : `${a.display_name} ${maskAccount(a.account_number)}`) : "—"; };
  const rowActions = (p: any) => <RowActions label={p.reference || formatDate(p.payment_date)} actions={[
    { label: "View", icon: Eye, onClick: () => setViewing(p) },
    { label: "Edit", icon: Pencil, disabled: p.is_reversed, onClick: () => setDlg({ open: true, row: p }) },
    { label: "Reverse", icon: Undo2, destructive: true, disabled: p.is_reversed, onClick: () => setRemoval({ table: "payments", id: p.id, label: p.reference || `Payment ${formatDate(p.payment_date)}`, action: "reverse" }) },
  ]} />;

  return (
    <div>
      <PageHeader title={thirdParty ? "Third-Party Payments" : "Payments & Receipts"}
        description={thirdParty ? "Someone else pays on behalf of a party. Only the original party's balance goes down." : "Receipts reduce what parties owe Gokul; payments reduce what Gokul owes. Mistakes are reversed, never deleted."}
        actions={<>
          <Button variant="outline" onClick={() => downloadCSV(thirdParty ? "third-party-payments.csv" : "payments.csv", [
            ["Date", "Type", "Party/Transporter", thirdParty ? "Payer" : "Mode", "Account", "Reference", "Amount", "Reversed"],
            ...rows.map((p) => [formatDate(p.payment_date), PAYMENT_TYPE[p.payment_type], who(p), thirdParty ? p.payer_name : p.mode, acct(p.account_id), p.reference, Number(p.amount).toFixed(2), p.is_reversed ? "Yes" : ""]),
            ["", "", "", "", "", "Total received", totIn.toFixed(2), ""], ["", "", "", "", "", "Total paid", totOut.toFixed(2), ""],
            ...(stmt && sel ? [["", "", "", "", "", `${sel.kind === "cash" ? "Cash" : sel.display_name} opening balance (${stmt.openLabel})`, stmt.open.toFixed(2), ""],
              ["", "", "", "", "", "All money in (incl. expenses/salary out)", stmt.rin.toFixed(2), ""], ["", "", "", "", "", "All money out", stmt.rout.toFixed(2), ""],
              ["", "", "", "", "", "Closing balance", stmt.close.toFixed(2), ""]] : []),
          ])}>Download CSV</Button>
          <Button onClick={() => setDlg({ open: true, row: null })}><Plus className="mr-1 h-4 w-4" />{thirdParty ? "Record third-party payment" : "New entry"}</Button></>} />
      <div role="search" aria-label="Filter payments" className="list-filters mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <Input aria-label="Search payments" className="sm:col-span-2" placeholder="Search party, payer, reference…" value={f.search} onChange={(e) => setF({ ...f, search: e.target.value })} />
        <select aria-label="Party" className={selectCls} value={f.party} onChange={(e) => setF({ ...f, party: e.target.value })}><option value="">All parties</option>{parties.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        <select aria-label="Payment account" className={selectCls} value={f.account} onChange={(e) => setF({ ...f, account: e.target.value })}><option value="">All accounts</option>{accounts.data?.map((a) => <option key={a.id} value={a.id}>{a.kind === "cash" ? "Cash" : a.display_name}</option>)}</select>
        {!thirdParty && <select aria-label="Payment direction" className={selectCls} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="">Receipts & payments</option><option value="in">Receipts only</option><option value="out">Payments only</option></select>}
        <div className={dateRangeCls}><Input type="date" aria-label="From date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /><Input type="date" aria-label="To date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></div>
      </div>
      {showBalances && (sel ? (
        <section aria-label="Account balance" className="mb-5 rounded-lg border bg-card p-4">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-medium">{sel.kind === "cash" ? "Cash" : sel.display_name} — balance</h2>
            {sel.opening_date ? <span className="text-xs text-muted-foreground">Opening {formatINR(sel.opening_balance)} as on {formatDate(sel.opening_date)} · earlier entries are not counted</span>
              : <span className="text-xs text-warning-foreground">No opening balance set — set it in Settings → Cash & bank accounts</span>}
          </div>
          {stmt ? <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div><dt className="text-muted-foreground">Opening ({stmt.openLabel})</dt><dd className="font-medium"><Money value={stmt.open} /></dd></div>
            <div><dt className="text-muted-foreground">Money in</dt><dd className="font-medium"><Money value={stmt.rin} /></dd></div>
            <div><dt className="text-muted-foreground">Money out</dt><dd className="font-medium"><Money value={stmt.rout} /></dd></div>
            <div><dt className="text-muted-foreground">Closing balance</dt><dd className="font-semibold"><Money value={stmt.close} /></dd></div>
          </dl> : <LoadingState />}
          <p className="mt-2 text-xs text-muted-foreground">Includes receipts and payments plus trip expenses, advances and salary paid from this account. Use the date filter to match a statement period.</p>
        </section>
      ) : (balances.data?.length ?? 0) > 0 && (
        <div aria-label="Account balances" className="mb-5 flex flex-wrap gap-2">
          {accounts.data?.filter((a) => a.is_active).map((a) => { const b = balances.data?.find((x) => x.account_id === a.id); return (
            <button key={a.id} type="button" onClick={() => setF({ ...f, account: a.id })} className="rounded-lg border bg-card px-3 py-2 text-left text-sm hover:bg-muted">
              <span className="block text-xs text-muted-foreground">{a.kind === "cash" ? "Cash" : a.display_name}</span>
              <span className="font-medium"><Money value={b?.balance ?? 0} /></span>
            </button>); })}
        </div>
      ))}
      {q.isPending ? <LoadingState /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : rows.length === 0 ? <EmptyState title="Nothing recorded yet" action={<Button onClick={() => setDlg({ open: true, row: null })}>Add entry</Button>} /> : (<>
        <MobileCards>{rows.map((p) => (
          <MobileCard key={p.id} muted={p.is_reversed} title={who(p) || "—"} aside={<Money value={p.amount} />} actions={rowActions(p)}>
            <div className="flex flex-wrap gap-1"><StatusBadge tone={isIn(p.payment_type) ? "success" : "warning"}>{PAYMENT_TYPE[p.payment_type]}</StatusBadge>{p.is_reversed && <StatusBadge tone="danger">Reversed</StatusBadge>}</div>
            <div>{formatDate(p.payment_date)} · {acct(p.account_id)}</div>
            {thirdParty && p.payer_name && <div>Paid by {p.payer_name}</div>}
            {(p.reference || p.txn_reference) && <div>Ref {p.reference ?? p.txn_reference}</div>}
          </MobileCard>))}
          <li className="rounded border bg-muted px-3 py-2 text-sm">Received <Money value={totIn} /> · Paid <Money value={totOut} /> (reversed excluded)</li>
        </MobileCards>
        <div className="hidden overflow-x-auto rounded-lg border bg-card sm:block"><Table>
          <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead>{thirdParty ? "Original party" : "Party / Transporter"}</TableHead>{thirdParty && <TableHead>Paid by</TableHead>}<TableHead>Account</TableHead><TableHead>Reference</TableHead><TableHead className="text-right">Amount</TableHead><TableHead className={actionCell}>Actions</TableHead></TableRow></TableHeader>
          <TableBody>{rows.map((p) => (
            <TableRow key={p.id} className={p.is_reversed ? "opacity-50" : ""}>
              <TableCell>{formatDate(p.payment_date)}</TableCell>
              <TableCell><StatusBadge tone={isIn(p.payment_type) ? "success" : "warning"}>{PAYMENT_TYPE[p.payment_type]}</StatusBadge>{p.is_reversed && <StatusBadge tone="danger">Reversed</StatusBadge>}</TableCell>
              <TableCell>{who(p)}</TableCell>{thirdParty && <TableCell>{p.payer_name}</TableCell>}
              <TableCell>{acct(p.account_id)}{p.bank_account_number && <span className="block text-xs text-muted-foreground">{p.bank_name} {maskAccount(p.bank_account_number)}</span>}</TableCell>
              <TableCell>{p.reference ?? p.txn_reference ?? "—"}</TableCell>
              <TableCell className="text-right"><Money value={p.amount} /></TableCell>
              <TableCell className={actionCell}>{rowActions(p)}</TableCell>
            </TableRow>))}</TableBody>
          <TableFooter><TableRow><TableCell colSpan={thirdParty ? 6 : 5}>Received <Money value={totIn} /> · Paid <Money value={totOut} /> (reversed entries excluded)</TableCell><TableCell colSpan={2} /></TableRow></TableFooter>
        </Table></div></>
      )}
      <RemovalDialog target={removal} onClose={() => setRemoval(null)} />
      {viewing && <RecordDetails title="Payment / receipt" values={[["Date", formatDate(viewing.payment_date)], ["Amount", viewing.amount], ["Reference", viewing.reference], ["Notes", viewing.notes], ["Reversal reason", viewing.reversal_reason]]} onClose={() => setViewing(null)} />}
      <PaymentDialog open={dlg.open} onOpenChange={(o) => setDlg({ open: o, row: o ? dlg.row : null })} initial={dlg.row} thirdParty={thirdParty} />
    </div>
  );
}
