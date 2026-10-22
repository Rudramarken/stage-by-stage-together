import { createFileRoute } from "@tanstack/react-router";
import { NotBuiltYet } from "@/components/app/ui";

export const Route = createFileRoute("/_authenticated/trips")({
  head: () => ({ meta: [{ title: "Trips — Gokul Cargo Movers" }] }),
  component: () => <NotBuiltYet title="Trips" />,
});
