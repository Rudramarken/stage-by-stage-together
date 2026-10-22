import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Gokul Cargo Movers" },
      { name: "description", content: "Transport management for Gokul Cargo Movers." },
      { property: "og:title", content: "Gokul Cargo Movers" },
      { property: "og:description", content: "Transport management for Gokul Cargo Movers." },
    ],
  }),
});
