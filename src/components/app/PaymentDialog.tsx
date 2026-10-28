import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "./ui";
import { selectCls } from "./Section";
import { SearchSelect } from "./SearchSelect";
import { errorMessage } from "./states";
import { useAccounts, useParties, useTransporters, createTransporterInline, PAYMENT_TYPE, PAY_MODES } from "@/lib/lookups";
import { accountLabel } from "@/lib/accounts";
import { todayIST } from "@/lib/format";

const BANK_MODES = PAY_MODES.filter((m) => m.value !== "cash");

export function PaymentDialog({ open, onOpenChange, initial, thirdParty }: { open: boolean; onOpenChange: (o: boolean) => void; initial?: Record<string, any> | null; thirdParty?: boolean }) {
  const qc = useQueryClient();
  const accounts = useAccounts(); const parties = useParties(); const transporters = useTransporters();
  const lrs = useQuery({
    queryKey: ["lrs-pick"],
    queryFn: async () => {
      const { data, error } = await supabase.from("lrs").select("id, lr_number, final_freight, freight_payable, transporter_id, trip_id").eq("status", "active").order("lr_number", { ascending: false }).limit(500);
      if (error) throw error;
      return data;
    },
  });
  // Account is deliberately left unselected for a new entry: the user must pick Cash, Cash Received by Narinder or a bank (no silent default).
  const blank = { payment_type: thirdParty ? "third_party_receipt" : "customer_receipt", payment_date: todayIST(), mode: "cash", account_id: "", allocate_amount: "" };
  const [v, setV] = useState<Record<string, any>>(blank);
  const [bank, setBank] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // One id per opened "new" form. A repeated submit (double click, retry after a timeout) carries the same id,
  // and save_payment returns the existing row instead of writing a second one.
  const newId = useRef<string>("");
  const busy = useRef(false);
  useEffect(() => {
    if (!open) return;
    setErr(null);
    newId.current = initial?.id ? "" : crypto.randomUUID();
    const init: Record<string, any> = initial ? { ...initial, allocate_amount: "" } : { ...blank };
    setV(init);
    setBank(!!(init.bank_name || init.bank_account_number || init.upi_id || init.txn_reference));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial?.id]);
  const set = (k: string, val: unknown) => setV((p) => ({ ...p, [k]: val }));
  const isTransporterPay = v.payment_type === "transporter_payment" || v.payment_type === "advance_paid";
  const isReceipt = v.payment_type?.includes("receipt") || v.payment_type === "advance_received";
  const selected = accounts.data?.find((a) => a.id === v.account_id);
  const pickAccount = (id: string) => {
    const a = accounts.data?.find((x) => x.id === id);
    setV((p) => ({ ...p, account_id: id, mode: !a ? p.mode : a.kind === "cash" ? "cash" : p.mode && p.mode !== "cash" ? p.mode : "neft" }));
  };
  const save = useMutation({
    mutationFn: async () => {
      if (busy.current) throw new Error("Already saving");
      if (!(Number(v.amount) > 0)) throw new Error("Amount must be greater than 0");
      if (Math.abs(Math.round(Number(v.amount) * 100) - Number(v.amount) * 100) > 1e-6) throw new Error("Amount can have at most 2 decimals");
      if (!v.account_id || !selected) throw new Error("Choose Cash, Cash Received by Narinder or a saved bank account");
      if (selected.kind === "bank" && (!v.mode || v.mode === "cash")) throw new Error("Choose how the bank payment was made");
      if (!v.party_id && !v.transporter_id) throw new Error(isTransporterPay ? "Choose the transporter or party" : "Choose the party");
      if (v.payment_type === "third_party_receipt" && !v.payer_name?.trim()) throw new Error("Enter who actually paid");
      const alloc = !v.id && v.lr_id && Number(v.allocate_amount) > 0 ? Number(v.allocate_amount) : 0;
      if (alloc > Number(v.amount)) throw new Error("Allocated amount cannot be more than the payment amount");
      const payload: Record<string, any> = {
        id: v.id ?? newId.current, create: !v.id, payment_type: v.payment_type, party_id: v.party_id || null,
        transporter_id: isTransporterPay ? v.transporter_id || null : null, payer_name: v.payment_type === "third_party_receipt" ? v.payer_name.trim() : null,
        amount: Number(v.amount), payment_date: v.payment_date, mode: selected.kind === "cash" ? "cash" : v.mode, account_id: v.account_id,
        reference: v.reference || null, notes: v.notes || null, lr_id: v.lr_id || null, trip_id: v.trip_id || null, allocate_amount: alloc || null,
        bank_name: bank ? v.bank_name || null : null, bank_holder: bank ? v.bank_holder || null : null, bank_account_number: bank ? v.bank_account_number || null : null,
        bank_ifsc: bank ? v.bank_ifsc || null : null, upi_id: bank ? v.upi_id || null : null, txn_reference: bank ? v.txn_reference || null : null,
      };
      if (payload.party_id && payload.transporter_id) payload.party_id = null;
      busy.current = true;
      try {
        // One database transaction: payment row + optional LR allocation (all or nothing).
        const { error } = await (supabase as any).rpc("save_payment", { p: payload });
        if (error) throw error;
      } finally { busy.current = false; }
    },
    onSuccess: () => {
      toast.success("Saved");
      onOpenChange(false);
      for (const k of ["payments", "ledger", "outstanding", "dashboard", "settlements", "account-balances", "account-movements", "account-unassigned", "lrs-pick"]) qc.invalidateQueries({ queryKey: [k] });
    },
    onError: (e) => { const m = errorMessage(e); if (m !== "Already saving") setErr(m); },
  });
  const banks = accounts.data?.filter((a) => a.kind === "bank" && (a.is_active || a.id === v.account_id)) ?? [];
  const cashAccounts = accounts.data?.filter((a) => a.kind === "cash") ?? [];
  return (
    <Dialog open={open} onOpenChange={(o) => !save.isPending && onOpenChange(o)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>{v.id ? "Edit" : "New"} {thirdParty ? "third-party payment" : "payment / receipt"}</DialogTitle></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          {!thirdParty && <Field label="Type" required><select className={selectCls} value={v.payment_type} onChange={(e) => set("payment_type", e.target.value)}>
            {Object.entries(PAYMENT_TYPE).filter(([k]) => k !== "third_party_receipt").map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>}
          {isTransporterPay && <Field label="Transporter" hint="Or choose a party below">
            <SearchSelect value={v.transporter_id} onChange={(x) => set("transporter_id", x)} options={(transporters.data ?? []).map((t) => ({ value: t.id, label: t.name }))}
              onCreate={async (t) => { const id = await createTransporterInline(t); qc.invalidateQueries({ queryKey: ["transporters"] }); return id; }} createLabel="Add transporter" /></Field>}
          {!(isTransporterPay && v.transporter_id) && <Field label={thirdParty ? "Original party (whose balance is cleared)" : "Party"} required>
            <SearchSelect value={v.party_id} onChange={(x) => set("party_id", x)} options={(parties.data ?? []).map((p) => ({ value: p.id, label: p.name }))} /></Field>}
          {thirdParty && <Field label="Actual payer name" required hint="No party record needed; their balance is not changed"><Input value={v.payer_name ?? ""} onChange={(e) => set("payer_name", e.target.value)} /></Field>}
          <Field label="Amount (₹)" required><Input type="number" min="0" step="0.01" value={v.amount ?? ""} onChange={(e) => set("amount", e.target.value)} /></Field>
          <Field label="Date" required><Input type="date" value={v.payment_date ?? ""} onChange={(e) => set("payment_date", e.target.value)} /></Field>
          <Field label={isReceipt ? "Received into" : "Paid from"} required hint={selected ? `This entry changes only: ${accountLabel(selected)}` : "Each account keeps its own balance"}>
            <select aria-label={isReceipt ? "Received into" : "Paid from"} className={selectCls} value={v.account_id ?? ""} onChange={(e) => pickAccount(e.target.value)}>
              <option value="">— Choose account —</option>
              {cashAccounts.length > 0 && <optgroup label="Cash">{cashAccounts.map((a) => <option key={a.id} value={a.id}>{a.display_name}</option>)}</optgroup>}
              {banks.length > 0 && <optgroup label="Bank accounts">{banks.map((a) => <option key={a.id} value={a.id}>{accountLabel(a)}{a.is_active ? "" : " (inactive)"}</option>)}</optgroup>}
            </select>
            {banks.length === 0 && <Link to="/settings" className="text-xs text-info underline">+ Add bank account</Link>}
          </Field>
          {selected?.kind === "bank" && <Field label="Mode" required><select className={selectCls} value={v.mode === "cash" ? "" : v.mode ?? ""} onChange={(e) => set("mode", e.target.value)}><option value="">— Choose —</option>{BANK_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</select></Field>}
          <Field label="Reference"><Input value={v.reference ?? ""} onChange={(e) => set("reference", e.target.value)} /></Field>
          <Field label="Link to LR (optional)">
            <SearchSelect value={v.lr_id} onChange={(x) => set("lr_id", x)} options={(lrs.data ?? []).map((l) => ({ value: l.id, label: l.lr_number }))} /></Field>
          {!v.id && v.lr_id && <Field label="Amount to allocate to that LR (₹)" hint="Leave empty to only link. A part of the payment is allowed.">
            <Input type="number" min="0" step="0.01" value={v.allocate_amount ?? ""} onChange={(e) => set("allocate_amount", e.target.value)} /></Field>}
          <div className="sm:col-span-2"><Field label="Notes"><Input value={v.notes ?? ""} onChange={(e) => set("notes", e.target.value)} /></Field></div>
          <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={bank} onChange={(e) => setBank(e.target.checked)} />Add the other party's bank details (optional)</label>
          {bank && <>
            <Field label="Bank name"><Input value={v.bank_name ?? ""} onChange={(e) => set("bank_name", e.target.value)} /></Field>
            <Field label="Account holder"><Input value={v.bank_holder ?? ""} onChange={(e) => set("bank_holder", e.target.value)} /></Field>
            <Field label="Account number"><Input value={v.bank_account_number ?? ""} onChange={(e) => set("bank_account_number", e.target.value)} /></Field>
            <Field label="IFSC"><Input value={v.bank_ifsc ?? ""} onChange={(e) => set("bank_ifsc", e.target.value)} /></Field>
            <Field label="UPI ID"><Input value={v.upi_id ?? ""} onChange={(e) => set("upi_id", e.target.value)} /></Field>
            <Field label="Transaction reference"><Input value={v.txn_reference ?? ""} onChange={(e) => set("txn_reference", e.target.value)} /></Field>
          </>}
          {err && <p role="alert" className="rounded bg-destructive/10 p-2 text-sm text-destructive sm:col-span-2">{err}</p>}
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>Cancel</Button><Button onClick={() => { setErr(null); save.mutate(); }} disabled={save.isPending}>{save.isPending ? "Saving…" : "Save"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
