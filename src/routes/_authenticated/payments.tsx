import { pageHead } from "@/lib/page-head";
import { createFileRoute } from "@tanstack/react-router";
import { PaymentsList } from "@/components/app/PaymentsList";

export const Route = createFileRoute("/_authenticated/payments")({
  head: () => pageHead("Payments & Receipts — Gokul Cargo Movers", "Payments & Receipts records for Gokul Cargo Movers transport management."),
  component: () => <PaymentsList />,
});
