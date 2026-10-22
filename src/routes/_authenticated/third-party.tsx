import { createFileRoute } from "@tanstack/react-router";
import { PaymentsList } from "@/components/app/PaymentsList";

export const Route = createFileRoute("/_authenticated/third-party")({
  head: () => ({ meta: [{ title: "Third-Party Payments — Gokul Cargo Movers" }] }),
  component: () => <PaymentsList thirdParty />,
});
