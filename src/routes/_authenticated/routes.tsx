import { createFileRoute } from "@tanstack/react-router";
import { MasterCrud } from "@/components/app/MasterCrud";

export const Route = createFileRoute("/_authenticated/routes")({
  head: () => ({ meta: [{ title: "Routes — Gokul Cargo Movers" }] }),
  component: () => (
    <MasterCrud table="routes" title="Routes" singular="Route" orderBy="origin"
      description="Optional list of common routes. You can always type any place on a trip."
      searchKeys={["origin", "destination"]}
      fields={[
        { name: "origin", label: "From", required: true },
        { name: "destination", label: "To", required: true },
        { name: "distance_km", label: "Distance (km)", type: "number" },
        { name: "notes", label: "Notes", type: "textarea" },
      ]}
      columns={[
        { label: "Route", render: (r) => <span className="font-medium">{r.origin} → {r.destination}</span> },
        { label: "Distance", render: (r) => (r.distance_km ? `${r.distance_km} km` : "—") },
      ]}
    />
  ),
});
