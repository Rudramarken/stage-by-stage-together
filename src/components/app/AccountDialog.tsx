import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Field } from "./ui";
import { errorMessage } from "./states";
import { accountFormSchema, type AccountFormInput } from "@/lib/account-form";
import { saveAccount } from "@/lib/api/accounts.functions";
import type { Tables } from "@/integrations/supabase/types";

export function AccountDialog({ account, onClose }: { account: Tables<"payment_accounts"> | null; onClose: () => void }) {
  const qc = useQueryClient();
  const busy = useRef(false);
  const cash = account?.kind === "cash";
  const [form, setForm] = useState<AccountFormInput>(() => ({
    id: account?.id ?? crypto.randomUUID(), display_name: account?.display_name ?? "", bank_name: account?.bank_name ?? "",
    account_number: account?.account_number ?? "", ifsc: account?.ifsc ?? "", opening_balance: account?.opening_balance ?? 0, opening_date: account?.opening_date ?? "",
  }));
  const [error, setError] = useState("");
  const save = useMutation({
    mutationFn: () => saveAccount({ data: { account: form, creating: !account } }),
    onSuccess: async () => {
      await Promise.all(["payment_accounts", "account-balances", "account-movements"].map((key) => qc.invalidateQueries({ queryKey: [key] })));
      toast.success(account ? "Account updated" : "Bank account added");
      onClose();
    },
    onError: (e) => setError(errorMessage(e)),
    onSettled: () => { busy.current = false; },
  });
  const set = (key: keyof AccountFormInput, value: string) => setForm((f) => ({ ...f, [key]: value }));
  return <Dialog open onOpenChange={(open) => { if (!open && !busy.current) onClose(); }}>
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
      <DialogHeader><DialogTitle>{account ? cash ? `Edit opening balance — ${account.display_name}` : "Edit Bank Account" : "Add Bank Account"}</DialogTitle>
        <DialogDescription>Opening balance is counted once at the start of the selected date. Earlier transactions remain in history but are excluded from the current balance.</DialogDescription>
      </DialogHeader>
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => {
        e.preventDefault(); if (busy.current) return;
        const parsed = accountFormSchema.safeParse(form);
        if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Check the account details"); return; }
        setError(""); busy.current = true; save.mutate();
      }}>
        {!cash && <>
          <Field label="Account name" required><Input required maxLength={150} value={form.display_name} onChange={(e) => set("display_name", e.target.value)} /></Field>
          <Field label="Bank name"><Input maxLength={150} value={form.bank_name} onChange={(e) => set("bank_name", e.target.value)} /></Field>
          <Field label="Account number"><Input maxLength={40} autoComplete="off" value={form.account_number} onChange={(e) => set("account_number", e.target.value)} /></Field>
          <Field label="IFSC code"><Input maxLength={11} autoCapitalize="characters" value={form.ifsc} onChange={(e) => set("ifsc", e.target.value.toUpperCase())} /></Field>
        </>}
        <Field label="Opening balance (₹)" hint="Use a negative amount for an overdraft"><Input type="number" step="0.01" required value={form.opening_balance} onChange={(e) => set("opening_balance", e.target.value)} /></Field>
        <Field label="Opening balance date" required={Number(form.opening_balance) !== 0}><Input type="date" required={Number(form.opening_balance) !== 0} value={form.opening_date} onChange={(e) => set("opening_date", e.target.value)} /></Field>
        {error && <p role="alert" className="text-sm text-destructive sm:col-span-2">{error}</p>}
        <DialogFooter className="sm:col-span-2"><Button type="button" variant="outline" disabled={save.isPending} onClick={onClose}>Cancel</Button><Button type="submit" disabled={save.isPending}>{save.isPending ? "Saving…" : "Save account"}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}