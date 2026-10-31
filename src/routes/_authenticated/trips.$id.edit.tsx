import { pageHead } from "@/lib/page-head";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app/ui";
import { LoadingState, ErrorState } from "@/components/app/states";
import { TripForm, tripToForm } from "@/components/app/TripForm";

export const Route = createFileRoute("/_authenticated/trips/$id/edit")({
  head: () => pageHead("Edit trip — Gokul Cargo Movers", "Edit trip records for Gokul Cargo Movers transport management."),
  component: EditTrip,
});

function EditTrip() {
  const { id } = Route.useParams();
  const q = useQuery({
    queryKey: ["trip-edit", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("trips").select("*, trip_stops(*)").eq("id", id).single();
      if (error) throw error;
      // Saved, non-cancelled trip-scope expenses and DRIVER advances, so the form edits the same records (never creates copies).
      const [exp, adv, dt] = await Promise.all([
        supabase.from("expenses").select("*").eq("trip_id", id).eq("scope", "trip").eq("is_cancelled", false).order("created_at"),
        supabase.from("advances").select("*").eq("trip_id", id).eq("recipient_type", "driver").eq("is_cancelled", false).order("created_at"),
        supabase.from("driver_transactions").select("*").eq("trip_id", id).eq("is_cancelled", false).order("created_at"),
      ]);
      if (exp.error) throw exp.error;
      if (adv.error) throw adv.error;
      if (dt.error) throw dt.error;
      return { ...data, __expenses: exp.data ?? [], __advances: adv.data ?? [], __driverTransactions: dt.data ?? [] };
    },
    gcTime: 0,
  });
  if (q.isPending) return <LoadingState />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const { trip_stops, __expenses, __advances, __driverTransactions, ...t } = q.data as any;
  return <div><PageHeader title={`Edit ${t.trip_number}`} /><TripForm initial={tripToForm(t, [...trip_stops].sort((a: any, b: any) => a.seq - b.seq))} initialExpenses={__expenses} initialAdvances={__advances} initialDriverTransactions={__driverTransactions} /></div>;
}
