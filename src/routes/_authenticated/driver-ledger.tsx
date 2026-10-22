import { createFileRoute } from "@tanstack/react-router";
import { NotBuiltYet } from "@/components/app/ui";

export const Route = createFileRoute("/_authenticated/driver-ledger")({
  head: () => ({ meta: [{ title: "Driver Ledger — Gokul Cargo Movers" }] }),
  component: () => <NotBuiltYet title="Driver Ledger" />,
});
