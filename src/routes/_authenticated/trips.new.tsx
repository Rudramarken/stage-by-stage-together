import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { PageHeader } from "@/components/app/ui";
import { TripForm } from "@/components/app/TripForm";
import { todayIST } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/trips/new")({
  validateSearch: z.object({ parent: z.string().optional(), kind: z.enum(["return", "leg"]).optional() }),
  head: () => ({ meta: [{ title: "New trip — Gokul Cargo Movers" }] }),
  component: NewTrip,
});

function NewTrip() {
  const { parent, kind } = Route.useSearch();
  const initial = parent ? {
    trip_date: todayIST(), journey_type: kind === "return" ? "round" : "multi", direction: kind === "return" ? "down" : "up", status: "booked", vehicle_mode: "own",
    parent_trip_id: parent, leg_label: kind === "return" ? "Return leg" : "Next leg",
    stops: [{ location: "", stop_type: "loading", status: "planned" }, { location: "", stop_type: "unloading", status: "planned" }],
  } : undefined;
  return (
    <div>
      <PageHeader title={parent ? (kind === "return" ? "New return leg" : "New linked leg") : "New trip"} description={parent ? "Nothing is copied from the other leg — enter this leg's own details." : undefined} />
      <TripForm initial={initial} />
    </div>
  );
}
