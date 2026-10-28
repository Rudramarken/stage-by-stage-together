import { pageHead } from "@/lib/page-head";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/lib/business";
import { addOwner, listPendingUsers, approveUser } from "@/lib/api/admin.functions";
import { PageHeader, Field, StatusBadge } from "@/components/app/ui";
import { LoadingState, ErrorState, errorMessage } from "@/components/app/states";
import { MasterCrud } from "@/components/app/MasterCrud";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { maskAccount, formatINR, formatDate } from "@/lib/format";
import { useAccountBalances, useUnassignedOutflows } from "@/lib/accounts";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => pageHead("Business Settings — Gokul Cargo Movers", "Business Settings records for Gokul Cargo Movers transport management."),
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <div>
      <PageHeader title="Business Settings" />
      <Tabs defaultValue="business">
        <TabsList className="mb-4 flex-wrap">
          <TabsTrigger value="business">Business details</TabsTrigger>
          <TabsTrigger value="accounts">Cash & bank accounts</TabsTrigger>
          <TabsTrigger value="transporters">Transporters</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
        </TabsList>
        <TabsContent value="business"><BusinessForm /></TabsContent>
        <TabsContent value="accounts">
          <AccountsTab />
        </TabsContent>
        <TabsContent value="transporters">
          <p className="mb-3 text-sm text-muted-foreground">Transporters typed on trips/LRs are added here automatically (once). You can link one to a Party.</p>
          <TransportersTab />
        </TabsContent>
        <TabsContent value="users"><UsersTab /></TabsContent>
      </Tabs>
    </div>
  );
}

function AccountsTab() {
  const { role } = useBusiness();
  const canEdit = role === "owner" || role === "admin";
  // Balance = opening balance + receipts - payments on/after the opening date, from every money source (see account_movements in migration 0022).
  const balances = useAccountBalances();
  const unassigned = useUnassignedOutflows();
  const balanceOf = (acct: Record<string, any>) => balances.data?.find((b) => b.account_id === acct.id) ?? null;
  const total = (balances.data ?? []).reduce((s, b) => s + Number(b.balance), 0);
  return (
    <>
      <p className="mb-3 text-sm text-muted-foreground">
        Cash and Cash Received by Narinder are two separate permanent accounts; each bank account you add is separate too. Set an opening balance and the date you start working from:
        the opening balance is the balance at the start of that date and is counted once. Balance = opening balance + receipts − payments recorded on or after that date (reversed and cancelled entries ignored).
        {!canEdit && " Only an Owner or Admin can add or change accounts."}
      </p>
      {balances.isError && <p role="alert" className="mb-3 rounded bg-destructive/10 p-2 text-sm text-destructive">Could not load balances: {errorMessage(balances.error)}.</p>}
      {balances.data && <p className="mb-3 text-sm">Total cash + bank (sum of all accounts below): <b>{formatINR(total)}</b></p>}
      {unassigned.data && unassigned.data.length > 0 && (
        <p role="status" className="mb-3 rounded border border-warning/40 bg-warning/10 p-2 text-sm">
          Provisional balances: {unassigned.data.map((u) => `${u.source}: ${u.entries} entr${Number(u.entries) === 1 ? "y" : "ies"} (${formatINR(u.amount)})`).join("; ")} have no cash/bank account selected, so they are not in any balance.
        </p>
      )}
      <MasterCrud hideHeader readOnly={!canEdit} table="payment_accounts" title="Accounts" singular="Bank account" orderBy="display_name"
        searchKeys={["display_name", "bank_name", "account_holder"]}
        canArchive={(r) => r.kind !== "cash"}
        transform={(v, row) => row?.kind === "cash"
          ? { ...v, kind: "cash", display_name: row.display_name, bank_name: null, account_holder: null, account_number: null, ifsc: null, opening_balance: v.opening_balance ?? 0 }
          : { ...v, kind: "bank", opening_balance: v.opening_balance ?? 0 }}
        validate={(v) => (Number(v.opening_balance || 0) !== 0 && !v.opening_date ? "Opening date is required when an opening balance is entered" : null)}
        fields={[
          { name: "display_name", label: "Display name", required: true, hint: "e.g. HDFC Current. The names Cash and Cash Received by Narinder are fixed." },
          { name: "bank_name", label: "Bank name" },
          { name: "account_holder", label: "Account holder" },
          { name: "account_number", label: "Account number", sensitive: true, hint: "Optional. Only the last 4 digits are shown in lists." },
          { name: "ifsc", label: "IFSC" },
          { name: "opening_balance", label: "Opening balance (₹)", type: "number", allowNegative: true, hint: "Balance at the start of the opening date. Use a minus value for an overdraft." },
          { name: "opening_date", label: "Opening date", type: "date", hint: "The date you start recording from" },
        ]}
        columns={[
          { label: "Name", render: (r) => <span className="font-medium">{r.display_name}</span> },
          { label: "Type", render: (r) => <StatusBadge tone={r.kind === "cash" ? "success" : "info"}>{r.kind === "cash" ? "Cash" : "Bank"}</StatusBadge> },
          { label: "Bank", render: (r) => r.bank_name ?? "—" },
          { label: "Account no.", render: (r) => maskAccount(r.account_number) },
          { label: "IFSC", render: (r) => r.ifsc ?? "—" },
          { label: "Opening balance", render: (r) => (r.opening_date || Number(r.opening_balance) ? <span>{formatINR(r.opening_balance)}<span className="block text-xs text-muted-foreground">as of {formatDate(r.opening_date)}</span></span> : "—") },
          { label: "Current balance", render: (r) => { const b = balanceOf(r); return b == null ? "…" : <span className="font-medium">{formatINR(b.balance)}{b.entries_before_opening > 0 && <span className="block text-xs font-normal text-muted-foreground">{b.entries_before_opening} entr{b.entries_before_opening === 1 ? "y" : "ies"} before the opening date not counted</span>}</span>; } },
        ]}
      />
    </>
  );
}

function TransportersTab() {
  const parties = useQuery({
    queryKey: ["parties"],
    queryFn: async () => {
      const { data, error } = await supabase.from("parties").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });
  const opts = [{ value: "", label: "— Not linked —" }, ...(parties.data ?? []).map((p) => ({ value: p.id, label: p.name }))];
  return (
    <MasterCrud hideHeader table="transporters" title="Transporters" singular="Transporter" orderBy="name"
      searchKeys={["name", "phone"]}
      transform={(v) => ({ ...v, party_id: v.party_id || null })}
      fields={[
        { name: "name", label: "Name", required: true },
        { name: "phone", label: "Phone" },
        { name: "party_id", label: "Linked party (optional)", type: "select", options: opts },
        { name: "notes", label: "Notes", type: "textarea" },
      ]}
      columns={[
        { label: "Name", render: (r) => <span className="font-medium">{r.name}</span> },
        { label: "Phone", render: (r) => r.phone ?? "—" },
        { label: "Linked party", render: (r) => parties.data?.find((p) => p.id === r.party_id)?.name ?? "—" },
      ]}
    />
  );
}

function BusinessForm() {
  const { businessId, role } = useBusiness();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["settings", businessId],
    queryFn: async () => {
      const { data, error } = await supabase.from("business_settings").select("*").eq("business_id", businessId).single();
      if (error) throw error;
      return data;
    },
  });
  const [f, setF] = useState<Record<string, string>>({});
  useEffect(() => { if (q.data) setF(Object.fromEntries(Object.entries(q.data).map(([k, v]) => [k, (v ?? "") as string]))); }, [q.data]);
  const save = useMutation({
    mutationFn: async () => {
      if (!f.trip_prefix?.trim() || !f.lr_prefix?.trim()) throw new Error("Trip prefix and LR prefix are required");
      const { error } = await supabase.from("business_settings").update({
        trip_prefix: f.trip_prefix.trim(), lr_prefix: f.lr_prefix.trim(), phone: f.phone || null, email: f.email || null,
        address: f.address || null, city: f.city || null, state: f.state || null,
      }).eq("business_id", businessId).select().single();
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Settings saved"); qc.invalidateQueries({ queryKey: ["settings"] }); qc.invalidateQueries({ queryKey: ["business-context"] }); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (q.isPending) return <LoadingState />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const disabled = role !== "owner";
  return (
    <form className="grid max-w-3xl gap-4 rounded-lg border bg-card p-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); if (!save.isPending) save.mutate(); }}>
      <Field label="Trip number prefix" required hint="Changing this never changes old numbers"><Input disabled={disabled} value={f.trip_prefix ?? ""} onChange={(e) => setF({ ...f, trip_prefix: e.target.value })} /></Field>
      <Field label="LR number prefix" required><Input disabled={disabled} value={f.lr_prefix ?? ""} onChange={(e) => setF({ ...f, lr_prefix: e.target.value })} /></Field>
      <Field label="Phone"><Input disabled={disabled} value={f.phone ?? ""} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
      <Field label="Email"><Input disabled={disabled} value={f.email ?? ""} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
      <Field label="City"><Input disabled={disabled} value={f.city ?? ""} onChange={(e) => setF({ ...f, city: e.target.value })} /></Field>
      <Field label="State"><Input disabled={disabled} value={f.state ?? ""} onChange={(e) => setF({ ...f, state: e.target.value })} /></Field>
      <div className="sm:col-span-2"><Field label="Address"><Textarea disabled={disabled} value={f.address ?? ""} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field></div>
      <p className="text-sm text-muted-foreground sm:col-span-2">Dates are shown as DD/MM/YYYY (India time).</p>
      <div className="sm:col-span-2"><Button type="submit" disabled={disabled || save.isPending}>{save.isPending ? "Saving…" : "Save settings"}</Button></div>
    </form>
  );
}

function UsersTab() {
  const { role } = useBusiness();
  const qc = useQueryClient();
  const [f, setF] = useState({ displayName: "", email: "", password: "" });
  const q = useQuery({
    queryKey: ["members"],
    queryFn: async () => {
      const { data, error } = await supabase.from("business_members").select("user_id, display_name, email, role").order("created_at");
      if (error) throw error;
      return data;
    },
  });
  const add = useMutation({
    mutationFn: () => addOwner({ data: f }),
    onSuccess: () => { toast.success("Owner added. They can now sign in."); setF({ displayName: "", email: "", password: "" }); qc.invalidateQueries({ queryKey: ["members"] }); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="rounded-lg border bg-card p-4">
        <h3 className="mb-3 font-semibold">Current users</h3>
        {q.isPending ? <LoadingState /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : (
          <ul className="divide-y">{q.data.map((m) => (
            <li key={m.user_id} className="flex items-center justify-between py-2 text-sm">
              <span><b>{m.display_name}</b><br /><span className="text-muted-foreground">{m.email}</span></span>
              <StatusBadge tone="info">{m.role}</StatusBadge>
            </li>))}</ul>
        )}
      </div>
      {role === "owner" && <PendingUsers />}
      {role === "owner" && (
        <form className="flex flex-col gap-3 rounded-lg border bg-card p-4" onSubmit={(e) => {
          e.preventDefault();
          if (add.isPending) return;
          if (f.password.length < 8) { toast.error("Password must be at least 8 characters"); return; }
          add.mutate();
        }}>
          <h3 className="font-semibold">Add another Owner</h3>
          <Field label="Name" required><Input value={f.displayName} onChange={(e) => setF({ ...f, displayName: e.target.value })} required /></Field>
          <Field label="Email" required><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required /></Field>
          <Field label="Temporary password" required hint="Share it privately; they can change it with 'Forgot password'."><Input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required /></Field>
          <Button type="submit" disabled={add.isPending}>{add.isPending ? "Adding…" : "Add Owner"}</Button>
        </form>
      )}
    </div>
  );
}

function PendingUsers() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["pending-users"], queryFn: () => listPendingUsers() });
  const approve = useMutation({
    mutationFn: (v: { userId: string; role: "owner" | "admin" | "staff" }) => approveUser({ data: v }),
    onSuccess: () => { toast.success("User approved. They can now sign in and see the business."); qc.invalidateQueries({ queryKey: ["pending-users"] }); qc.invalidateQueries({ queryKey: ["members"] }); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <div className="rounded-lg border bg-card p-4 lg:col-span-2">
      <h3 className="mb-1 font-semibold">New sign-ups waiting for approval</h3>
      <p className="mb-3 text-sm text-muted-foreground">People who signed up themselves see nothing until you approve them here.</p>
      {q.isPending ? <LoadingState /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : q.data.length === 0 ? <p className="text-sm text-muted-foreground">No one is waiting.</p> : (
        <ul className="divide-y">{q.data.map((u) => (
          <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
            <span><b>{u.name || u.email}</b> <span className="text-muted-foreground">{u.email}</span> {!u.confirmed && <StatusBadge tone="warning">Email not confirmed</StatusBadge>}</span>
            <span className="flex gap-2">
              <Button size="sm" variant="outline" disabled={approve.isPending} onClick={() => approve.mutate({ userId: u.id, role: "staff" })}>Approve as Staff</Button>
              <Button size="sm" disabled={approve.isPending} onClick={() => approve.mutate({ userId: u.id, role: "owner" })}>Approve as Owner</Button>
            </span>
          </li>))}</ul>
      )}
    </div>
  );
}
