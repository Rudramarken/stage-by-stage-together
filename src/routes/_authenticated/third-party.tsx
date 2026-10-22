import { pageHead } from "@/lib/page-head";
import { createFileRoute } from "@tanstack/react-router";
import { PaymentsList } from "@/components/app/PaymentsList";

export const Route = createFileRoute("/_authenticated/third-party")({
  head: () => pageHead("Third-Party Payments — Gokul Cargo Movers", "Third-Party Payments records for Gokul Cargo Movers transport management."),
  component: () => <PaymentsList thirdParty />,
});
