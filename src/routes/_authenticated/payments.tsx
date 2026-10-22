import { createFileRoute } from "@tanstack/react-router";
import { PaymentsList } from "@/components/app/PaymentsList";

export const Route = createFileRoute("/_authenticated/payments")({
  head: () => ({ meta: [{ title: "Payments & Receipts — Gokul Cargo Movers" }] }),
  component: () => <PaymentsList />,
});
