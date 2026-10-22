import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, Money } from "@/components/app/ui";
import { LoadingState, ErrorState } from "@/components/app/states";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Gokul Cargo Movers" }] }),
  component: Dashboard,
});

function Dashboard() {
  const q = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const count = async (t: "parties" | "vehicles" | "drivers" | "routes") => {
        const { count, error } = await supabase.from(t).select("id", { count: "exact", head: true }).eq("is_active", true);
        if (error) throw error;
        return count ?? 0;
      };
      const [parties, vehicles, drivers, routes] = await Promise.all([count("parties"), count("vehicles"), count("drivers"), count("routes")]);
      const { data: bal, error } = await supabase.from("account_balances").select("account_type, balance").eq("account_type", "party");
      if (error) throw error;
      const receivable = (bal ?? []).reduce((s, b) => s + Math.max(0, Number(b.balance)), 0);
      const payable = (bal ?? []).reduce((s, b) => s + Math.max(0, -Number(b.balance)), 0);
      return { parties, vehicles, drivers, routes, receivable, payable };
    },
  });
  return (
    <div>
      <PageHeader title="Dashboard" description="Live figures from your records." />
      {q.isPending ? <LoadingState /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Active parties" value={q.data.parties} to="/parties" />
            <Stat label="Gokul vehicles" value={q.data.vehicles} to="/vehicles" />
            <Stat label="Active drivers" value={q.data.drivers} to="/drivers" />
            <Stat label="Saved routes" value={q.data.routes} to="/routes" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border bg-card p-4"><p className="text-sm text-muted-foreground">Outstanding receivable (parties owe Gokul)</p><p className="mt-1 text-2xl font-semibold text-success"><Money value={q.data.receivable} /></p></div>
            <div className="rounded-lg border bg-card p-4"><p className="text-sm text-muted-foreground">Outstanding payable (Gokul owes parties)</p><p className="mt-1 text-2xl font-semibold text-warning-foreground"><Money value={q.data.payable} /></p></div>
          </div>
          <p className="text-sm text-muted-foreground">Trip, freight, receipt and expense figures will appear here once Trips, LRs and Payments are built.</p>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, to }: { label: string; value: number; to: "/parties" | "/vehicles" | "/drivers" | "/routes" }) {
  return (
    <Link to={to} className="rounded-lg border bg-card p-4 transition-colors hover:border-info">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-3xl font-semibold text-primary tabular">{value}</p>
    </Link>
  );
}
