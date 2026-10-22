import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/app/ui";
import { LoadingState, ErrorState } from "@/components/app/states";
import { LRForm } from "@/components/app/LRForm";
import { loadLR, lrToForm } from "@/lib/lr-load";

export const Route = createFileRoute("/_authenticated/lr/$id/edit")({
  head: () => ({ meta: [{ title: "Edit LR — Gokul Cargo Movers" }] }),
  component: () => {
    const { id } = Route.useParams();
    const q = useQuery({ queryKey: ["lr-edit", id], queryFn: () => loadLR(id), gcTime: 0 });
    if (q.isPending) return <LoadingState />;
    if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
    return <div><PageHeader title={`Edit ${q.data.lr.lr_number}`} /><LRForm initial={lrToForm(q.data)} /></div>;
  },
});
