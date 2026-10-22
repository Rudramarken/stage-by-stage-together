import { createFileRoute } from "@tanstack/react-router";
import { NotBuiltYet } from "@/components/app/ui";

export const Route = createFileRoute("/_authenticated/outstanding")({
  head: () => ({ meta: [{ title: "Outstanding Balances — Gokul Cargo Movers" }] }),
  component: () => <NotBuiltYet title="Outstanding Balances" />,
});
