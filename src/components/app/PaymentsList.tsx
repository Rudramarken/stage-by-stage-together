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
import { useAccounts, useParties, useTransporters, nameOf, PAYMENT_TYPE } from "@/lib/lookups";
import { downloadCSV, formatDate, maskAccount } from "@/lib/format";

export function PaymentsList({ thirdParty }: { thirdParty?: boolean }) {
  const qc = useQueryClient();
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
  const reverse = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { error } = await supabase.from("payments").update({ is_reversed: true, reversal_reason: reason }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Payment reversed"); for (const k of ["payments", "ledger", "outstanding"]) qc.invalidateQueries({ queryKey: [k] }); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const isIn = (t: string) => ["customer_receipt", "advance_received", "third_party_receipt"].includes(t);
  const rows = useMemo(() => (q.data ?? []).filter((p) => {
    if (thirdParty ? p.payment_type !== "third_party_receipt" : false) return false;
    if (f.account && p.account_id !== f.account) return false;
    if (f.kind === "in" && !isIn(p.payment_type)) return false;
    if (f.kind === "out" && isIn(p.payment_type)) return false;
    if (f.party && p.party_id !== f.party) return false;
    if (f.from && p.payment_date < f.from) return false;
    if (f.to && p.payment_date > f.to) return false;
    const s = f.search.trim().toLowerCase();
    return !s || [p.reference, p.payer_name, p.txn_reference, nameOf(parties.data, p.party_id), nameOf(transporters.data, p.transporter_id)].join(" ").toLowerCase().includes(s);
  }), [q.data, f, thirdParty, parties.data, transporters.data]);
  const live = rows.filter((r) => !r.is_reversed);
  const totIn = live.filter((r) => isIn(r.payment_type)).reduce((s, r) => s + Number(r.amount), 0);
  const totOut = live.filter((r) => !isIn(r.payment_type)).reduce((s, r) => s + Number(r.amount), 0);
  const who = (p: any) => nameOf(transporters.data, p.transporter_id) || nameOf(parties.data, p.party_id);
  const acct = (id: string) => { const a = accounts.data?.find((x) => x.id === id); return a ? (a.kind === "cash" ? "Cash" : `${a.display_name} ${maskAccount(a.account_number)}`) : "—"; };

  return (
    <div>
      <PageHeader title={thirdParty ? "Third-Party Payments" : "Payments & Receipts"}
        description={thirdParty ? "Someone else pays on behalf of a party. Only the original party's balance goes down." : "Receipts reduce what parties owe Gokul; payments reduce what Gokul owes. Mistakes are reversed, never deleted."}
        actions={<>
          <Button variant="outline" onClick={() => downloadCSV(thirdParty ? "third-party-payments.csv" : "payments.csv", [
            ["Date", "Type", "Party/Transporter", thirdParty ? "Payer" : "Mode", "Account", "Reference", "Amount", "Reversed"],
            ...rows.map((p) => [formatDate(p.payment_date), PAYMENT_TYPE[p.payment_type], who(p), thirdParty ? p.payer_name : p.mode, acct(p.account_id), p.reference, Number(p.amount).toFixed(2), p.is_reversed ? "Yes" : ""]),
            ["", "", "", "", "", "Total received", totIn.toFixed(2), ""], ["", "", "", "", "", "Total paid", totOut.toFixed(2), ""],
          ])}>Download CSV</Button>
          <Button onClick={() => setDlg({ open: true, row: null })}><Plus className="mr-1 h-4 w-4" />{thirdParty ? "Record third-party payment" : "New entry"}</Button></>} />
      <div className="mb-4 grid gap-2 sm:grid-cols-6">
        <Input className="sm:col-span-2" placeholder="Search party, payer, reference…" value={f.search} onChange={(e) => setF({ ...f, search: e.target.value })} />
        <select className={selectCls} value={f.party} onChange={(e) => setF({ ...f, party: e.target.value })}><option value="">All parties</option>{parties.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        <select className={selectCls} value={f.account} onChange={(e) => setF({ ...f, account: e.target.value })}><option value="">All accounts</option>{accounts.data?.map((a) => <option key={a.id} value={a.id}>{a.kind === "cash" ? "Cash" : a.display_name}</option>)}</select>
        {!thirdParty && <select className={selectCls} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="">Receipts & payments</option><option value="in">Receipts only</option><option value="out">Payments only</option></select>}
        <div className="flex gap-1"><Input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /><Input type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></div>
      </div>
      {q.isPending ? <LoadingState /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : rows.length === 0 ? <EmptyState title="Nothing recorded yet" action={<Button onClick={() => setDlg({ open: true, row: null })}>Add entry</Button>} /> : (
        <div className="overflow-x-auto rounded-lg border bg-card"><Table>
          <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead>{thirdParty ? "Original party" : "Party / Transporter"}</TableHead>{thirdParty && <TableHead>Paid by</TableHead>}<TableHead>Account</TableHead><TableHead>Reference</TableHead><TableHead className="text-right">Amount</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>{rows.map((p) => (
            <TableRow key={p.id} className={p.is_reversed ? "opacity-50" : ""}>
              <TableCell>{formatDate(p.payment_date)}</TableCell>
              <TableCell><StatusBadge tone={isIn(p.payment_type) ? "success" : "warning"}>{PAYMENT_TYPE[p.payment_type]}</StatusBadge>{p.is_reversed && <StatusBadge tone="danger">Reversed</StatusBadge>}</TableCell>
              <TableCell>{who(p)}</TableCell>{thirdParty && <TableCell>{p.payer_name}</TableCell>}
              <TableCell>{acct(p.account_id)}{p.bank_account_number && <span className="block text-xs text-muted-foreground">{p.bank_name} {maskAccount(p.bank_account_number)}</span>}</TableCell>
              <TableCell>{p.reference ?? p.txn_reference ?? "—"}</TableCell>
              <TableCell className="text-right"><Money value={p.amount} /></TableCell>
              <TableCell className="whitespace-nowrap text-right">{!p.is_reversed && <>
                <Button variant="ghost" size="sm" onClick={() => setDlg({ open: true, row: p })}><Pencil className="h-4 w-4" /></Button>
                <Button variant="ghost" size="sm" title="Reverse" onClick={() => { const r = window.prompt("Reason for reversing (required):"); if (r?.trim()) reverse.mutate({ id: p.id, reason: r.trim() }); }}><Undo2 className="h-4 w-4" /></Button></>}</TableCell>
            </TableRow>))}</TableBody>
          <TableFooter><TableRow><TableCell colSpan={thirdParty ? 6 : 5}>Received <Money value={totIn} /> · Paid <Money value={totOut} /> (reversed entries excluded)</TableCell><TableCell colSpan={2} /></TableRow></TableFooter>
        </Table></div>
      )}
      <PaymentDialog open={dlg.open} onOpenChange={(o) => setDlg({ open: o, row: o ? dlg.row : null })} initial={dlg.row} thirdParty={thirdParty} />
    </div>
  );
}
