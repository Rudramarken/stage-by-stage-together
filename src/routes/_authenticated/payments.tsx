import { createFileRoute } from "@tanstack/react-router";
import { NotBuiltYet } from "@/components/app/ui";

export const Route = createFileRoute("/_authenticated/payments")({
  head: () => ({ meta: [{ title: "Payments & Receipts — Gokul Cargo Movers" }] }),
  component: () => <NotBuiltYet title="Payments & Receipts" />,
});
