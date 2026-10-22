import { createFileRoute } from "@tanstack/react-router";
import { NotBuiltYet } from "@/components/app/ui";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({ meta: [{ title: "Reports — Gokul Cargo Movers" }] }),
  component: () => <NotBuiltYet title="Reports" />,
});
