import { pageHead } from "@/lib/page-head";
import { createFileRoute } from "@tanstack/react-router";
import { MasterCrud } from "@/components/app/MasterCrud";
import { useDrivers, nameOf } from "@/lib/lookups";

export const Route = createFileRoute("/_authenticated/vehicles")({
  head: () => pageHead("Vehicles — Gokul Cargo Movers", "Vehicles records for Gokul Cargo Movers transport management."),
  component: Vehicles,
});

function Vehicles() {
  const drivers = useDrivers();
  const driverOpts = [{ value: "", label: "— Not assigned —" }, ...(drivers.data ?? []).filter((d) => d.is_active).map((d) => ({ value: d.id, label: d.name }))];
  return (
    <MasterCrud table="vehicles" title="Vehicles" singular="Vehicle" orderBy="registration_number"
      description="Only Gokul's own trucks. Market trucks are typed directly on a trip."
      searchKeys={["registration_number", "vehicle_type"]}
      transform={(v) => ({ ...v, driver_id: v.driver_id || null })}
      fields={[
        { name: "registration_number", label: "Registration number", required: true, hint: "e.g. HR35F 3747 — spaces/dashes are ignored when checking duplicates" },
        { name: "vehicle_type", label: "Vehicle type / name" },
        { name: "capacity", label: "Capacity", hint: "e.g. 25 tonne" },
        { name: "driver_id", label: "Assigned driver (optional)", type: "select", options: driverOpts },
        { name: "notes", label: "Notes", type: "textarea" },
      ]}
      columns={[
        { label: "Registration", render: (r) => <span className="font-medium">{r.registration_number}</span> },
        { label: "Type", render: (r) => r.vehicle_type ?? "—" },
        { label: "Capacity", render: (r) => r.capacity ?? "—" },
        { label: "Driver", render: (r) => nameOf(drivers.data, r.driver_id) || "Not assigned" },
      ]}
    />
  );
}
