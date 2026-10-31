import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeftRight, Plus, Undo2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader, Money, StatusBadge } from "./ui";
import { LoadingState, ErrorState, EmptyState, errorMessage } from "./states";
import { MobileCards, MobileCard } from "./MobileCards";
import { RowActions, actionCell } from "./RowActions";
import { TransferDialog } from "./TransferDialog";
import { useAccounts } from "@/lib/lookups";
import { accountLabel, fetchAllRows } from "@/lib/accounts";
import { formatDate } from "@/lib/format";

/** Internal account transfers (cash deposits into bank, bank-to-bank). Reversed with a reason, never deleted. */
export function TransfersList() {
  const qc = useQueryClient();
  const accounts = useAccounts();
  const [dlgOpen, setDlgOpen] = useState(false);
  const [reversing, setReversing] = useState<any>(null);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["account-transfers"],
    queryFn: () => fetchAllRows<any>((from, to) => supabase.from("account_transfers").select("*").order("transfer_date", { ascending: false }).order("created_at", { ascending: false }).order("id").range(from, to)),
  });
  const acct = (id: string) => accountLabel(accounts.data?.find((a) => a.id === id));

  const reverse = useMutation({
    mutationFn: async () => {
      if (!reversing) return;
      if (!reason.trim()) throw new Error("Reversal reason required");
      const { error } = await (supabase as any).rpc("reverse_account_transfer", { p_id: reversing.id, p_reason: reason.trim() });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Transfer reversed");
      setReversing(null); setReason(""); setErr(null);
      for (const k of ["account-transfers", "account-balances", "account-movements", "dashboard"]) qc.invalidateQueries({ queryKey: [k] });
    },
    onError: (e) => setErr(errorMessage(e)),
  });

  const rowActions = (t: any) => <RowActions label={`Transfer ${formatDate(t.transfer_date)}`} actions={[
    { label: "Reverse", icon: Undo2, destructive: true, disabled: t.is_reversed, onClick: () => { setReversing(t); setReason(""); setErr(null); } },
  ]} />;

  return (
    <div>
      <PageHeader title="Account transfers" description="Moving Gokul's own money between Cash, Cash Received by Narinder and bank accounts. Not income, expense, or a party/transporter payment. Mistakes are reversed, never deleted."
        actions={<Button onClick={() => setDlgOpen(true)}><Plus className="mr-1 h-4 w-4" />New transfer</Button>} />
      {q.isPending ? <LoadingState /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : (q.data ?? []).length === 0 ? (
        <EmptyState title="No transfers yet" hint="Use New transfer to record a cash deposit into a bank account." action={<Button onClick={() => setDlgOpen(true)}>New transfer</Button>} />
      ) : (<>
        <MobileCards>{(q.data ?? []).map((t) => (
          <MobileCard key={t.id} muted={t.is_reversed} title={<span className="inline-flex items-center gap-1">{acct(t.from_account_id)} <ArrowLeftRight className="h-3.5 w-3.5" /> {acct(t.to_account_id)}</span>} aside={<Money value={t.amount} />} actions={rowActions(t)}>
            <div className="flex flex-wrap gap-1"><StatusBadge tone="info">Transfer</StatusBadge>{t.is_reversed && <StatusBadge tone="danger">Reversed</StatusBadge>}</div>
            <div>{formatDate(t.transfer_date)}{t.reference ? ` · Ref ${t.reference}` : ""}</div>
            {t.is_reversed && t.reversal_reason && <div>Reason: {t.reversal_reason}</div>}
          </MobileCard>))}
        </MobileCards>
        <div className="hidden overflow-x-auto rounded-lg border bg-card sm:block"><Table>
          <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>From</TableHead><TableHead>To</TableHead><TableHead>Reference</TableHead><TableHead className="text-right">Amount</TableHead><TableHead>Status</TableHead><TableHead className={actionCell}>Actions</TableHead></TableRow></TableHeader>
          <TableBody>{(q.data ?? []).map((t) => (
            <TableRow key={t.id} className={t.is_reversed ? "opacity-50" : ""}>
              <TableCell>{formatDate(t.transfer_date)}</TableCell>
              <TableCell>{acct(t.from_account_id)}</TableCell>
              <TableCell>{acct(t.to_account_id)}</TableCell>
              <TableCell>{t.reference ?? "—"}{t.is_reversed && t.reversal_reason && <span className="block text-xs text-muted-foreground">Reversed: {t.reversal_reason}</span>}</TableCell>
              <TableCell className="text-right"><Money value={t.amount} /></TableCell>
              <TableCell>{t.is_reversed ? <StatusBadge tone="danger">Reversed</StatusBadge> : <StatusBadge tone="success">Done</StatusBadge>}</TableCell>
              <TableCell className={actionCell}>{rowActions(t)}</TableCell>
            </TableRow>))}
          </TableBody>
        </Table></div>
      </>)}
      <TransferDialog open={dlgOpen} onOpenChange={setDlgOpen} />
      <Dialog open={!!reversing} onOpenChange={(o) => !o && !reverse.isPending && setReversing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Reverse this transfer?</DialogTitle></DialogHeader>
          {reversing && <p className="text-sm">{formatDate(reversing.transfer_date)} · {acct(reversing.from_account_id)} → {acct(reversing.to_account_id)} · <Money value={reversing.amount} />. Both account balances go back; the record stays as history.</p>}
          <Input aria-label="Reversal reason" placeholder="Reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} />
          {err && <p role="alert" className="rounded bg-destructive/10 p-2 text-sm text-destructive">{err}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReversing(null)} disabled={reverse.isPending}>Cancel</Button>
            <Button variant="destructive" onClick={() => { setErr(null); reverse.mutate(); }} disabled={reverse.isPending}>{reverse.isPending ? "Reversing…" : "Reverse transfer"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
