import { pageHead } from "@/lib/page-head";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Field } from "@/components/app/ui";
import { LoadingState, ErrorState, EmptyState } from "@/components/app/states";
import { selectCls } from "@/components/app/Section";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAccounts, useDrivers, useParties, useTransporters, useVehicles, nameOf, PAYMENT_TYPE, TRIP_STATUS, FREIGHT_TYPE } from "@/lib/lookups";
import { downloadCSV, formatDate, formatINR } from "@/lib/format";
import { accountLabel, fetchAllRows } from "@/lib/accounts";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => pageHead("Reports — Gokul Cargo Movers", "Reports records for Gokul Cargo Movers transport management."),
  component: Reports,
});

type Col = { label: string; money?: boolean; total?: boolean };
type Rep = { cols: Col[]; rows: (string | number)[][]; note?: string };

const REPORTS = [
  ["trip_register", "Trip Register"], ["lr_register", "LR Register"], ["freight_summary", "Freight Summary (by party)"],
  ["trip_expenses", "Trip Expenses"], ["expense_category", "Expense by Category"], ["party_expenses", "Consignor / Consignee Expenses"],
  ["transporter_payable", "Transporter Payable"], ["customer_receivable", "Customer Receivable"], ["driver_advances", "Driver Advances"],
  ["driver_salary", "Driver Salary"], ["commission", "Commission"], ["third_party", "Third-Party Payments"], ["by_account", "Payments by Account"],
  ["vehicle_trips", "Vehicle-wise Trips"], ["route_freight", "Route-wise Freight"], ["monthly", "Monthly Summary"],
] as const;

function Reports() {
  const [rep, setRep] = useState<string>("trip_register");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const parties = useParties(); const transporters = useTransporters(); const drivers = useDrivers(); const vehicles = useVehicles(); const accounts = useAccounts();
  const q = useQuery({
    queryKey: ["reports-data"],
    queryFn: async () => {
      // Every table is read in pages of 1000 (a plain select silently stops at 1000 rows, which would drop older records from reports and exports).
      const all = (table: string, cols: string, orderBy: string[] = ["id"], f?: (q: any) => any) => fetchAllRows<any>((from, to) => {
        let q = (supabase as any).from(table).select(cols);
        if (f) q = f(q);
        for (const o of orderBy) q = q.order(o);
        return q.range(from, to);
      });
      const [trips, lrs, exps, advs, pays, bal, sal, salp, commissions, receipts] = await Promise.all([
        all("trips", "*, trip_stops(location, seq), lrs(final_freight, freight_payable, status)"),
        all("lrs", "*, trips(trip_number, trip_stops(location, seq)), lr_parties(role, parties(name))"),
        all("expenses", "*", ["id"], (q) => q.eq("is_cancelled", false)),
        all("advances", "*", ["id"], (q) => q.eq("is_cancelled", false)),
        all("payments", "*", ["id"], (q) => q.eq("is_reversed", false)),
        all("account_balances", "*", ["account_type", "account_id"]),
        all("salary_entries", "*", ["id"], (q) => q.eq("is_cancelled", false)),
        all("salary_payments", "*", ["id"], (q) => q.eq("is_reversed", false)),
        all("commission_balances", "*"),
        all("commission_receipts", "*", ["id"], (q) => q.eq("is_reversed", false)),
      ]);
      return { trips: trips as any[], lrs: lrs as any[], exps: exps, advs: advs, pays: pays, bal: bal, sal: sal, salp: salp, commissions: commissions, receipts: receipts };
    },
  });

  const out: Rep | null = useMemo(() => {
    if (!q.data) return null;
    const inR = (d: string | null) => (!from || (d ?? "") >= from) && (!to || (d ?? "") <= to);
    const D = q.data;
    const lrs = D.lrs.filter((l) => l.status === "active" && inR(l.lr_date));
    const routeOf = (stops: any[]) => [...(stops ?? [])].sort((a, b) => a.seq - b.seq).map((s) => s.location).join(" → ");
    const pn = (l: any, role: string) => l.lr_parties.filter((p: any) => p.role === role).map((p: any) => p.parties?.name).join(", ");
    const group = <T,>(arr: T[], k: (x: T) => string, v: (x: T) => number) => { const m = new Map<string, number>(); for (const x of arr) m.set(k(x), (m.get(k(x)) ?? 0) + v(x)); return [...m.entries()]; };
    switch (rep) {
      case "trip_register": return { cols: [{ label: "Trip" }, { label: "Date" }, { label: "Route" }, { label: "Vehicle" }, { label: "Transporter" }, { label: "Driver" }, { label: "Status" }, { label: "Freight billed", money: true, total: true }, { label: "Freight payable", money: true, total: true }],
        rows: D.trips.filter((t) => inR(t.trip_date)).map((t) => [t.trip_number, formatDate(t.trip_date), routeOf(t.trip_stops), t.vehicle_mode === "own" ? nameOf(vehicles.data, t.vehicle_id, "registration_number") : t.market_vehicle_number ?? "", nameOf(transporters.data, t.transporter_id), nameOf(drivers.data, t.driver_id) || t.driver_name || "", TRIP_STATUS[t.status]?.label,
          t.lrs.filter((l: any) => l.status === "active").reduce((s: number, l: any) => s + Number(l.final_freight), 0), t.lrs.filter((l: any) => l.status === "active").reduce((s: number, l: any) => s + Number(l.freight_payable), 0)]) };
      case "lr_register": return { cols: [{ label: "LR" }, { label: "Date" }, { label: "Trip" }, { label: "Consignor" }, { label: "Consignee" }, { label: "Type" }, { label: "Weight" }, { label: "Base", money: true, total: true }, { label: "Additions", money: true, total: true }, { label: "Deductions", money: true, total: true }, { label: "Final freight (billed)", money: true, total: true }],
        rows: lrs.map((l) => [l.lr_number, formatDate(l.lr_date), l.trips?.trip_number ?? "", pn(l, "consignor"), pn(l, "consignee"), FREIGHT_TYPE[l.freight_type], l.weight ? `${l.weight} ${l.weight_unit}` : "", Number(l.base_freight), Number(l.additions_total), Number(l.deductions_total), Number(l.final_freight)]) };
      case "freight_summary": return { cols: [{ label: "Billed party" }, { label: "LRs" }, { label: "Freight billed", money: true, total: true }],
        rows: (() => { const m = new Map<string, [number, number]>(); for (const l of lrs) { const k = l.freight_type === "paid" ? pn(l, "consignor").split(",")[0] : l.freight_type === "to_pay" ? pn(l, "consignee").split(",")[0] : nameOf(parties.data, l.billing_party_id) || pn(l, "consignor").split(",")[0]; const x = m.get(k) ?? [0, 0]; m.set(k, [x[0] + 1, x[1] + Number(l.final_freight)]); } return [...m.entries()].map(([k, [n, a]]) => [k, n, a]); })() };
      case "trip_expenses": return { cols: [{ label: "Date" }, { label: "Trip" }, { label: "Category" }, { label: "Paid to" }, { label: "Method" }, { label: "Incurred", money: true, total: true }],
        rows: D.exps.filter((e) => e.scope === "trip" && inR(e.expense_date)).map((e) => [formatDate(e.expense_date), D.trips.find((t) => t.id === e.trip_id)?.trip_number ?? "", e.category, e.paid_to ?? "", e.payment_method ?? "", Number(e.amount)]) };
      case "expense_category": return { cols: [{ label: "Category" }, { label: "Incurred (all expenses)", money: true, total: true }],
        rows: group(D.exps.filter((e) => inR(e.expense_date)), (e) => e.category, (e) => Number(e.amount)).map(([k, v]) => [k, v]) };
      case "party_expenses": return { cols: [{ label: "Date" }, { label: "LR" }, { label: "Side" }, { label: "Category" }, { label: "Responsible" }, { label: "Status" }, { label: "Amount", money: true, total: true }],
        rows: D.exps.filter((e) => e.scope !== "trip" && inR(e.expense_date)).map((e) => [formatDate(e.expense_date), D.lrs.find((l) => l.id === e.lr_id)?.lr_number ?? "", e.scope, e.category, e.responsible === "party" ? `Party: ${nameOf(parties.data, e.responsible_party_id)}` : "Gokul", e.payment_status, Number(e.amount)]) };
      case "transporter_payable": return { cols: [{ label: "Transporter" }, { label: "Outstanding payable", money: true, total: true }], note: "All dates (live balance).",
        rows: D.bal.filter((b) => b.account_type === "transporter" && Number(b.balance) < 0).map((b) => [nameOf(transporters.data, b.account_id), -Number(b.balance)]) };
      case "customer_receivable": return { cols: [{ label: "Party" }, { label: "Outstanding receivable", money: true, total: true }], note: "All dates (live balance).",
        rows: D.bal.filter((b) => b.account_type === "party" && Number(b.balance) > 0).map((b) => [nameOf(parties.data, b.account_id), Number(b.balance)]) };
      case "driver_advances": return { cols: [{ label: "Date" }, { label: "Driver" }, { label: "Trip" }, { label: "Method" }, { label: "Paid", money: true, total: true }],
        rows: D.advs.filter((a) => a.recipient_type === "driver" && inR(a.advance_date)).map((a) => [formatDate(a.advance_date), nameOf(drivers.data, a.driver_id), D.trips.find((t) => t.id === a.trip_id)?.trip_number ?? "", a.payment_method ?? "", Number(a.amount)]) };
      case "driver_salary": return { cols: [{ label: "Driver" }, { label: "Month" }, { label: "Salary", money: true, total: true }, { label: "Paid", money: true, total: true }, { label: "Advance recovered", money: true, total: true }, { label: "Commission recovered", money: true, total: true }, { label: "Outstanding", money: true, total: true }],
        rows: D.sal.map((s) => { const p = D.salp.filter((x) => x.salary_entry_id === s.id); const paid = p.reduce((a, x) => a + Number(x.amount), 0); const rec = p.reduce((a, x) => a + Number(x.recovered_advance), 0); const com = p.reduce((a, x) => a + Number(x.recovered_commission), 0); return [nameOf(drivers.data, s.driver_id), s.period, Number(s.amount), paid, rec, com, Number(s.amount) - paid - rec - com]; }) };
      case "commission": return { cols: [{ label: "LR" }, { label: "Date" }, { label: "Payer" }, { label: "Status" }, { label: "Pending", money: true, total: true }, { label: "Received", money: true, total: true }],
        rows: D.commissions.filter((c) => inR(c.commission_date)).map((c) => [c.document_number ?? "", formatDate(c.commission_date), c.transporter_id ? nameOf(transporters.data, c.transporter_id) : nameOf(drivers.data, c.driver_id), c.is_cancelled ? "Cancelled" : Number(c.pending_amount) > 0 ? "Pending" : "Received", Number(c.pending_amount), Number(c.received_amount)]), note: "Driver commission balances. Received includes confirmed salary recovery; cash/bank receipts use actual receipt dates." };
      case "third_party": return { cols: [{ label: "Date" }, { label: "Original party" }, { label: "Paid by" }, { label: "Reference" }, { label: "Received", money: true, total: true }],
        rows: D.pays.filter((p) => p.payment_type === "third_party_receipt" && inR(p.payment_date)).map((p) => [formatDate(p.payment_date), nameOf(parties.data, p.party_id), p.payer_name ?? "", p.reference ?? "", Number(p.amount)]) };
      case "by_account": { const isIn = (t: string) => ["customer_receipt", "advance_received", "third_party_receipt"].includes(t);
        // Same rules as the account_movements view: each entry counted once, for the account it was recorded against.
        return { cols: [{ label: "Account" }, { label: "Received", money: true, total: true }, { label: "Paid", money: true, total: true }], note: "Payments & receipts, expenses paid by Gokul, advances, salary payments and commission cash receipts that have an account selected. Entries with no account are not listed. Balances: Payments > Bank / Cash statement.",
          rows: (accounts.data ?? []).map((a) => {
            const ps = D.pays.filter((p) => p.account_id === a.id && inR(p.payment_date));
            const cr = D.receipts.filter((r) => !r.salary_payment_id && r.account_id === a.id && inR(r.receipt_date));
            const ex = D.exps.filter((e) => e.account_id === a.id && e.payment_status === "paid" && e.responsible === "gokul" && inR(e.expense_date));
            const ad = D.advs.filter((x) => x.account_id === a.id && inR(x.advance_date));
            const sp = D.salp.filter((x) => x.account_id === a.id && Number(x.amount) > 0 && inR(x.payment_date));
            const sum = (rows: any[]) => rows.reduce((s, r) => s + Number(r.amount), 0);
            return [accountLabel(a), sum(ps.filter((p) => isIn(p.payment_type))) + sum(cr), sum(ps.filter((p) => !isIn(p.payment_type))) + sum(ex) + sum(ad) + sum(sp)];
          }) }; }
      case "vehicle_trips": return { cols: [{ label: "Vehicle" }, { label: "Trips" }, { label: "Freight billed", money: true, total: true }],
        rows: (() => { const m = new Map<string, [number, number]>(); for (const t of D.trips.filter((t) => t.status !== "cancelled" && inR(t.trip_date))) { const k = t.vehicle_mode === "own" ? nameOf(vehicles.data, t.vehicle_id, "registration_number") || "(none)" : `${t.market_vehicle_number} (market)`; const x = m.get(k) ?? [0, 0]; m.set(k, [x[0] + 1, x[1] + t.lrs.filter((l: any) => l.status === "active").reduce((s: number, l: any) => s + Number(l.final_freight), 0)]); } return [...m.entries()].map(([k, [n, a]]) => [k, n, a]); })() };
      case "route_freight": return { cols: [{ label: "Route" }, { label: "Freight billed", money: true, total: true }],
        rows: group(lrs, (l) => (l.trips ? routeOf(l.trips.trip_stops) : `${l.loading_point ?? "?"} → ${l.delivery_point ?? "?"}`), (l) => Number(l.final_freight)).map(([k, v]) => [k, v]) };
      case "monthly": { const months = new Set<string>([...lrs.map((l) => l.lr_date.slice(0, 7)), ...D.pays.map((p) => p.payment_date.slice(0, 7)), ...D.exps.map((e) => e.expense_date.slice(0, 7)), ...D.receipts.map((r) => r.receipt_date.slice(0, 7))]);
        return { cols: [{ label: "Month" }, { label: "Freight billed", money: true, total: true }, { label: "Receipts received", money: true, total: true }, { label: "Payments made", money: true, total: true }, { label: "Expenses incurred", money: true, total: true }, { label: "Commission received", money: true, total: true }],
          rows: [...months].sort().reverse().filter((m) => inR(m + "-01") || inR(m + "-28")).map((m) => [m,
            lrs.filter((l) => l.lr_date.startsWith(m)).reduce((s, l) => s + Number(l.final_freight), 0),
            D.pays.filter((p) => p.payment_date.startsWith(m) && inR(p.payment_date) && ["customer_receipt", "third_party_receipt", "advance_received"].includes(p.payment_type)).reduce((s, p) => s + Number(p.amount), 0) + D.receipts.filter((r) => !r.salary_payment_id && r.receipt_date.startsWith(m) && inR(r.receipt_date)).reduce((s, r) => s + Number(r.amount), 0),
            D.pays.filter((p) => p.payment_date.startsWith(m) && ["transporter_payment", "advance_paid"].includes(p.payment_type)).reduce((s, p) => s + Number(p.amount), 0),
            D.exps.filter((e) => e.expense_date.startsWith(m)).reduce((s, e) => s + Number(e.amount), 0),
            D.receipts.filter((r) => r.receipt_date.startsWith(m) && inR(r.receipt_date)).reduce((s, r) => s + Number(r.amount), 0)]) }; }
      default: return null;
    }
  }, [q.data, rep, from, to, parties.data, transporters.data, drivers.data, vehicles.data, accounts.data]);

  const totals = out?.cols.map((c, i) => (c.total ? out.rows.reduce((s, r) => s + Number(r[i] || 0), 0) : null));
  const title = REPORTS.find((r) => r[0] === rep)?.[1] ?? "";
  return (
    <div className="space-y-4">
      <PageHeader title="Reports" actions={out && <>
        <Button variant="outline" onClick={() => window.print()}>Print</Button>
            <Button variant="outline" onClick={() => downloadCSV(`${rep}.csv`, [out.cols.map((c) => c.label), ...out.rows.map((r) => r.map((x, i) => (out.cols[i].money ? Number(x).toFixed(2) : x))), (totals ?? []).map((t, i) => (i === 0 ? "Total" : t == null ? "" : t.toFixed(2)))])}>Download CSV</Button></>} />
      <div className="no-print grid gap-3 sm:grid-cols-4">
        <div className="sm:col-span-2"><Field label="Report"><select className={selectCls} value={rep} onChange={(e) => setRep(e.target.value)}>{REPORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field></div>
        <Field label="From"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="To"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      </div>
      <h2 className="text-lg font-semibold">{title}{(from || to) && <span className="text-sm font-normal text-muted-foreground"> · {from ? formatDate(from) : "start"} to {to ? formatDate(to) : "today"}</span>}</h2>
      {out?.note && <p className="text-xs text-muted-foreground">{out.note}</p>}
      {q.isPending ? <LoadingState /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : !out || out.rows.length === 0 ? <EmptyState title="No records for this report" /> : (
        <div className="overflow-x-auto rounded-lg border bg-card"><Table>
          <TableHeader><TableRow>{out.cols.map((c) => <TableHead key={c.label} className={c.money ? "text-right" : ""}>{c.label}</TableHead>)}</TableRow></TableHeader>
          <TableBody>{out.rows.map((r, i) => <TableRow key={i}>{r.map((x, j) => <TableCell key={j} className={out.cols[j].money ? "text-right tabular" : ""}>{out.cols[j].money ? formatINR(x) : x}</TableCell>)}</TableRow>)}</TableBody>
          <TableFooter><TableRow>{(totals ?? []).map((t, i) => <TableCell key={i} className={out.cols[i].money ? "text-right" : ""}>{i === 0 ? "Total" : t == null ? "" : formatINR(t)}</TableCell>)}</TableRow></TableFooter>
        </Table></div>
      )}
    </div>
  );
}
