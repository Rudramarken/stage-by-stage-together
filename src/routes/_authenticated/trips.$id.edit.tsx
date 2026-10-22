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
      return data;
    },
    gcTime: 0,
  });
  if (q.isPending) return <LoadingState />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const { trip_stops, ...t } = q.data as any;
  return <div><PageHeader title={`Edit ${t.trip_number}`} /><TripForm initial={tripToForm(t, [...trip_stops].sort((a: any, b: any) => a.seq - b.seq))} /></div>;
}
