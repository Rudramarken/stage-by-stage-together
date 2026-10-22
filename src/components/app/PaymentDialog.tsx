import { useEffect, useState } from "react";
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
import { todayIST } from "@/lib/format";

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
  const blank = { payment_type: thirdParty ? "third_party_receipt" : "customer_receipt", payment_date: todayIST(), mode: "cash", account_id: "", allocate: "" };
  const [v, setV] = useState<Record<string, any>>(blank);
  const [bank, setBank] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setErr(null);
    const cash = accounts.data?.find((a) => a.kind === "cash")?.id ?? "";
    const init: Record<string, any> = initial ? { ...initial } : { ...blank, account_id: cash };
    setV(init);
    setBank(!!(init.bank_name || init.bank_account_number || init.upi_id || init.txn_reference));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial, accounts.data]);
  const set = (k: string, val: unknown) => setV((p) => ({ ...p, [k]: val }));
  const isTransporterPay = v.payment_type === "transporter_payment" || v.payment_type === "advance_paid";
  const save = useMutation({
    mutationFn: async () => {
      if (!(Number(v.amount) > 0)) throw new Error("Amount must be greater than 0");
      if (!v.account_id) throw new Error("Choose Received Into / Paid From (Cash or a bank account)");
      if (!v.party_id && !v.transporter_id) throw new Error(isTransporterPay ? "Choose the transporter or party" : "Choose the party");
      if (v.payment_type === "third_party_receipt" && !v.payer_name?.trim()) throw new Error("Enter who actually paid");
      const row: Record<string, any> = {
        payment_type: v.payment_type, party_id: v.party_id || null, transporter_id: isTransporterPay ? v.transporter_id || null : null,
        payer_name: v.payment_type === "third_party_receipt" ? v.payer_name.trim() : null, amount: Number(v.amount), payment_date: v.payment_date,
        mode: v.mode, account_id: v.account_id, reference: v.reference || null, notes: v.notes || null, lr_id: v.lr_id || null, trip_id: v.trip_id || null,
        bank_name: bank ? v.bank_name || null : null, bank_holder: bank ? v.bank_holder || null : null, bank_account_number: bank ? v.bank_account_number || null : null,
        bank_ifsc: bank ? v.bank_ifsc || null : null, upi_id: bank ? v.upi_id || null : null, txn_reference: bank ? v.txn_reference || null : null,
      };
      if (row.party_id && row.transporter_id) row.party_id = null;
      const r = v.id ? await supabase.from("payments").update(row as never).eq("id", v.id).select().single() : await supabase.from("payments").insert(row as never).select().single();
      if (r.error) throw r.error;
      if (!v.id && v.lr_id && v.allocate) {
        const target = isTransporterPay ? "payable" : "receivable";
        const { error } = await supabase.from("payment_allocations").insert({ payment_id: r.data.id, lr_id: v.lr_id, target, amount: Number(v.amount) } as never);
        if (error) throw new Error(`Payment saved, but allocation failed: ${error.message}`);
      }
    },
    onSuccess: () => {
      toast.success("Saved");
      onOpenChange(false);
      for (const k of ["payments", "ledger", "outstanding", "dashboard", "settlements"]) qc.invalidateQueries({ queryKey: [k] });
    },
    onError: (e) => setErr(errorMessage(e)),
  });
  const banks = accounts.data?.filter((a) => a.kind === "bank" && (a.is_active || a.id === v.account_id)) ?? [];
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
          <Field label="Mode"><select className={selectCls} value={v.mode} onChange={(e) => set("mode", e.target.value)}>{PAY_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</select></Field>
          <Field label={v.payment_type?.includes("receipt") || v.payment_type === "advance_received" ? "Received into" : "Paid from"} required>
            <select className={selectCls} value={v.account_id ?? ""} onChange={(e) => set("account_id", e.target.value)}>
              <option value="">— Choose —</option>
              {accounts.data?.filter((a) => a.kind === "cash").map((a) => <option key={a.id} value={a.id}>Cash</option>)}
              {banks.map((a) => <option key={a.id} value={a.id}>{a.display_name}</option>)}
            </select>
            {banks.length === 0 && <Link to="/settings" className="text-xs text-info underline">+ Add bank account</Link>}
          </Field>
          <Field label="Reference"><Input value={v.reference ?? ""} onChange={(e) => set("reference", e.target.value)} /></Field>
          <Field label="Link to LR (optional)">
            <SearchSelect value={v.lr_id} onChange={(x) => set("lr_id", x)} options={(lrs.data ?? []).map((l) => ({ value: l.id, label: l.lr_number }))} /></Field>
          {!v.id && v.lr_id && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!v.allocate} onChange={(e) => set("allocate", e.target.checked ? "1" : "")} />Allocate this amount against that LR</label>}
          <div className="sm:col-span-2"><Field label="Notes"><Input value={v.notes ?? ""} onChange={(e) => set("notes", e.target.value)} /></Field></div>
          <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={bank} onChange={(e) => setBank(e.target.checked)} />Add bank details (optional)</label>
          {bank && <>
            <Field label="Bank name"><Input value={v.bank_name ?? ""} onChange={(e) => set("bank_name", e.target.value)} /></Field>
            <Field label="Account holder"><Input value={v.bank_holder ?? ""} onChange={(e) => set("bank_holder", e.target.value)} /></Field>
            <Field label="Account number"><Input value={v.bank_account_number ?? ""} onChange={(e) => set("bank_account_number", e.target.value)} /></Field>
            <Field label="IFSC"><Input value={v.bank_ifsc ?? ""} onChange={(e) => set("bank_ifsc", e.target.value)} /></Field>
            <Field label="UPI ID"><Input value={v.upi_id ?? ""} onChange={(e) => set("upi_id", e.target.value)} /></Field>
            <Field label="Transaction reference"><Input value={v.txn_reference ?? ""} onChange={(e) => set("txn_reference", e.target.value)} /></Field>
          </>}
          {err && <p className="rounded bg-destructive/10 p-2 text-sm text-destructive sm:col-span-2">{err}</p>}
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>Cancel</Button><Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? "Saving…" : "Save"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
