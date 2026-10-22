import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
  head: () => ({
    meta: [
      { title: "Gokul Cargo Movers" },
      { name: "description", content: "Transport management for Gokul Cargo Movers." },
      { property: "og:title", content: "Gokul Cargo Movers" },
      { property: "og:description", content: "Transport management for Gokul Cargo Movers." },
    ],
  }),
});
