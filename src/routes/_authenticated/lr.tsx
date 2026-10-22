import { createFileRoute } from "@tanstack/react-router";
import { NotBuiltYet } from "@/components/app/ui";

export const Route = createFileRoute("/_authenticated/lr")({
  head: () => ({ meta: [{ title: "LR / Bilty Register — Gokul Cargo Movers" }] }),
  component: () => <NotBuiltYet title="LR / Bilty Register" />,
});
