import { createFileRoute } from "@tanstack/react-router";
import { NotBuiltYet } from "@/components/app/ui";

export const Route = createFileRoute("/_authenticated/third-party")({
  head: () => ({ meta: [{ title: "Third-Party Payments — Gokul Cargo Movers" }] }),
  component: () => <NotBuiltYet title="Third-Party Payments" />,
});
