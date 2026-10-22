import { pageHead } from "@/lib/page-head";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { PageHeader } from "@/components/app/ui";
import { LRForm, blankLR } from "@/components/app/LRForm";

export const Route = createFileRoute("/_authenticated/lr/new")({
  validateSearch: z.object({ trip: z.string().optional() }),
  head: () => pageHead("New LR — Gokul Cargo Movers", "New LR records for Gokul Cargo Movers transport management."),
  component: () => {
    const { trip } = Route.useSearch();
    return <div><PageHeader title="New LR / Bilty" description="One LR = one load. Linking to a trip is optional." /><LRForm initial={blankLR(trip)} /></div>;
  },
});
