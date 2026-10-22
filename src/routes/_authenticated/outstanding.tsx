import { pageHead } from "@/lib/page-head";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Money } from "@/components/app/ui";
import { LoadingState, ErrorState } from "@/components/app/states";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { useDrivers, useParties, useTransporters, nameOf } from "@/lib/lookups";
import { downloadCSV } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/outstanding")({
  head: () => pageHead("Outstanding Balances — Gokul Cargo Movers", "Outstanding Balances records for Gokul Cargo Movers transport management."),
  component: Outstanding,
});

function Outstanding() {
  const parties = useParties(); const transporters = useTransporters(); const drivers = useDrivers();
  const q = useQuery({
    queryKey: ["outstanding"],
    queryFn: async () => {
      const { data, error } = await supabase.from("account_balances").select("*");
      if (error) throw error;
      const { data: com, error: e2 } = await supabase.from("commission_balances").select("id, document_number, pending_amount, driver_id").gt("pending_amount", 0);
      if (e2) throw e2;
      return { bal: data, com };
    },
  });
  if (q.isPending) return <LoadingState />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const b = q.data.bal.map((x) => ({ ...x, balance: Number(x.balance) }));
  const recv = b.filter((x) => x.account_type === "party" && x.balance > 0.004).map((x) => ({ name: nameOf(parties.data, x.account_id), id: x.account_id, amt: x.balance, kind: "Party" }));
  const pay = [
    ...b.filter((x) => x.account_type === "transporter" && x.balance < -0.004).map((x) => ({ name: nameOf(transporters.data, x.account_id), id: x.account_id, amt: -x.balance, kind: "Transporter" })),
    ...b.filter((x) => x.account_type === "party" && x.balance < -0.004).map((x) => ({ name: nameOf(parties.data, x.account_id), id: x.account_id, amt: -x.balance, kind: "Party / supplier" })),
  ];
  const drv = b.filter((x) => x.account_type === "driver" && Math.abs(x.balance) > 0.004).map((x) => ({ name: nameOf(drivers.data, x.account_id), id: x.account_id, amt: x.balance }));
  const advPaidTransporters = b.filter((x) => x.account_type === "transporter" && x.balance > 0.004).map((x) => ({ name: nameOf(transporters.data, x.account_id), amt: x.balance }));
  const sum = (a: { amt: number }[]) => a.reduce((s, x) => s + x.amt, 0);
  const comTotal = q.data.com.reduce((s, c) => s + Number(c.pending_amount), 0);

  const T = ({ title, rows, link }: { title: string; rows: { name: string; amt: number; kind?: string; id?: string | null }[]; link?: "party" | "driver" }) => (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center justify-between border-b px-4 py-3"><h2 className="font-semibold">{title}</h2>
        <Button size="sm" variant="outline" className="no-print" onClick={() => downloadCSV(`${title}.csv`, [["Name", "Type", "Amount"], ...rows.map((r) => [r.name, r.kind ?? "", r.amt.toFixed(2)]), ["Total", "", sum(rows).toFixed(2)]])}>CSV</Button></div>
      {rows.length === 0 ? <p className="p-4 text-sm text-muted-foreground">Nothing outstanding.</p> : (
        <Table><TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Type</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
          <TableBody>{rows.sort((a, b) => b.amt - a.amt).map((r, i) => <TableRow key={i}><TableCell>{link === "party" && r.kind === "Party" && r.id ? <Link to="/parties/$id" params={{ id: r.id }} className="text-info hover:underline">{r.name}</Link> : r.name}</TableCell><TableCell>{r.kind}</TableCell><TableCell className="text-right"><Money value={r.amt} /></TableCell></TableRow>)}</TableBody>
          <TableFooter><TableRow><TableCell colSpan={2}>Total</TableCell><TableCell className="text-right"><Money value={sum(rows)} /></TableCell></TableRow></TableFooter></Table>)}
    </div>
  );

  return (
    <div className="space-y-4">
      <PageHeader title="Outstanding Balances" description="Computed from the ledger: LR freight, expenses charged to parties and opening balances, less receipts, third-party and direct payments." actions={<Button variant="outline" onClick={() => window.print()}>Print</Button>} />
      <div className="grid gap-4 lg:grid-cols-2">
        <T title="Receivables — parties owe Gokul" rows={recv} link="party" />
        <T title="Payables — Gokul owes" rows={pay} />
        <T title="Receivable from drivers — commission (not income)" rows={q.data.com.map((c) => ({ name: `${c.document_number} · ${nameOf(drivers.data, c.driver_id)}`, amt: Number(c.pending_amount), kind: "Commission" }))} />
        <T title="Advances paid beyond freight (transporters owe back)" rows={advPaidTransporters.map((x) => ({ ...x, kind: "Transporter" }))} />
        <div className="lg:col-span-2"><T title="Driver balances (+ driver owes Gokul / − Gokul owes driver)" rows={drv.map((d) => ({ ...d, kind: d.amt > 0 ? "Driver owes" : "Gokul owes driver" }))} /></div>
      </div>
      <p className="text-xs text-muted-foreground">Pending commission total: <Money value={comTotal} /> (already included in driver balances, not an extra amount). Opening balances are never revenue.</p>
    </div>
  );
}
