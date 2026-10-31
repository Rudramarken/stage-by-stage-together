import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "./ui";
import { selectCls } from "./Section";
import { errorMessage } from "./states";
import { useAccounts } from "@/lib/lookups";
import { accountLabel } from "@/lib/accounts";
import { todayIST } from "@/lib/format";

/**
 * Internal account transfer / cash deposit: moves money between two of the business's own accounts
 * (e.g. depositing Cash into a bank). It is never income, expense, or a party/transporter payment.
 * One stable id per opened form: a repeated submit (double click, retry after a timeout) carries the
 * same id, and save_account_transfer returns the existing row instead of writing a second one.
 */
export function TransferDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const accounts = useAccounts();
  const blank = { from_account_id: "", to_account_id: "", amount: "", transfer_date: todayIST(), reference: "", notes: "" };
  const [v, setV] = useState<Record<string, any>>(blank);
  const [err, setErr] = useState<string | null>(null);
  const newId = useRef<string>("");
  const busy = useRef(false);
  useEffect(() => {
    if (!open) return;
    setErr(null);
    newId.current = crypto.randomUUID();
    setV({ ...blank });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const set = (k: string, val: unknown) => setV((p) => ({ ...p, [k]: val }));
  const list = accounts.data ?? [];
  const active = list.filter((a) => a.is_active);
  const from = list.find((a) => a.id === v.from_account_id);
  const to = list.find((a) => a.id === v.to_account_id);

  const save = useMutation({
    mutationFn: async () => {
      if (busy.current) throw new Error("Already saving");
      if (!v.from_account_id || !from) throw new Error("Choose the account money is taken from");
      if (!v.to_account_id || !to) throw new Error("Choose the account money goes into");
      if (v.from_account_id === v.to_account_id) throw new Error("Choose two different accounts");
      if (!(Number(v.amount) > 0)) throw new Error("Amount must be greater than 0");
      if (Math.abs(Math.round(Number(v.amount) * 100) - Number(v.amount) * 100) > 1e-6) throw new Error("Amount can have at most 2 decimals");
      if (!v.transfer_date) throw new Error("Choose the date");
      busy.current = true;
      try {
        const { error } = await (supabase as any).rpc("save_account_transfer", {
          p: { id: newId.current, from_account_id: v.from_account_id, to_account_id: v.to_account_id, amount: Number(v.amount), transfer_date: v.transfer_date, reference: v.reference || null, notes: v.notes || null },
        });
        if (error) throw error;
      } finally { busy.current = false; }
    },
    onSuccess: () => {
      toast.success("Transfer saved");
      onOpenChange(false);
      for (const k of ["account-transfers", "account-balances", "account-movements", "dashboard"]) qc.invalidateQueries({ queryKey: [k] });
    },
    onError: (e) => { const m = errorMessage(e); if (m !== "Already saving") setErr(m); },
  });

  const accountOptions = (exclude: string) => (
    <>
      <option value="">— Choose account —</option>
      {active.filter((a) => a.id !== exclude).map((a) => <option key={a.id} value={a.id}>{accountLabel(a)}</option>)}
    </>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !save.isPending && onOpenChange(o)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader><DialogTitle>Transfer between accounts</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">Use this for moving Gokul's own money, such as depositing Cash into a bank account. It is not income, expense, or a party/transporter payment.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="From account" required hint={from ? `Balance of ${accountLabel(from)} goes down` : undefined}>
            <select aria-label="From account" className={selectCls} value={v.from_account_id} onChange={(e) => set("from_account_id", e.target.value)}>{accountOptions(v.to_account_id)}</select>
          </Field>
          <Field label="To account" required hint={to ? `Balance of ${accountLabel(to)} goes up` : undefined}>
            <select aria-label="To account" className={selectCls} value={v.to_account_id} onChange={(e) => set("to_account_id", e.target.value)}>{accountOptions(v.from_account_id)}</select>
          </Field>
          <Field label="Amount (₹)" required><Input type="number" min="0" step="0.01" value={v.amount} onChange={(e) => set("amount", e.target.value)} /></Field>
          <Field label="Date" required><Input type="date" value={v.transfer_date} onChange={(e) => set("transfer_date", e.target.value)} /></Field>
          <Field label="Reference"><Input value={v.reference} onChange={(e) => set("reference", e.target.value)} /></Field>
          <Field label="Notes"><Input value={v.notes} onChange={(e) => set("notes", e.target.value)} /></Field>
          {err && <p role="alert" className="rounded bg-destructive/10 p-2 text-sm text-destructive sm:col-span-2">{err}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>Cancel</Button>
          <Button onClick={() => { setErr(null); save.mutate(); }} disabled={save.isPending}>{save.isPending ? "Saving…" : "Save transfer"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
