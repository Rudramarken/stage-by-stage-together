import { createFileRoute } from "@tanstack/react-router";
import { NotBuiltYet } from "@/components/app/ui";

export const Route = createFileRoute("/_authenticated/transporter-settlements")({
  head: () => ({ meta: [{ title: "Transporter Settlements — Gokul Cargo Movers" }] }),
  component: () => <NotBuiltYet title="Transporter Settlements" />,
});
