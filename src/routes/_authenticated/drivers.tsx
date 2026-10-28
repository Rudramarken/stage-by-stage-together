import { pageHead } from "@/lib/page-head";
import { createFileRoute } from "@tanstack/react-router";
import { MasterCrud } from "@/components/app/MasterCrud";
import { formatDate } from "@/lib/format";
import { useVehicles } from "@/lib/lookups";

export const Route = createFileRoute("/_authenticated/drivers")({
  head: () => pageHead("Drivers — Gokul Cargo Movers", "Drivers records for Gokul Cargo Movers transport management."),
  component: Drivers,
});

function Drivers() {
  const vehicles = useVehicles();
  return (
    <MasterCrud table="drivers" title="Drivers" singular="Driver" orderBy="name"
      description="Your drivers. On a trip you can also type any driver's name without adding them here."
      searchKeys={["name", "phone", "licence_number"]}
      fields={[
        { name: "name", label: "Name", required: true },
        { name: "phone", label: "Phone" },
        { name: "licence_number", label: "Licence number" },
        { name: "joining_date", label: "Joining date", type: "date" },
        { name: "salary_amount", label: "Agreed salary (₹)", type: "number" },
        { name: "salary_frequency", label: "Salary frequency", type: "select", options: [
          { value: "monthly", label: "Monthly" }, { value: "weekly", label: "Weekly" }, { value: "per_trip", label: "Per trip" }] },
        { name: "address", label: "Address", type: "textarea" },
        { name: "notes", label: "Notes", type: "textarea" },
      ]}
      defaults={{ salary_frequency: "monthly" }}
      columns={[
        { label: "Name", render: (r) => <span className="font-medium">{r.name}</span> },
        { label: "Phone", render: (r) => r.phone ?? "—" },
        { label: "Licence", render: (r) => r.licence_number ?? "—" },
        { label: "Joined", render: (r) => formatDate(r.joining_date) },
        { label: "Vehicle", render: (r) => (vehicles.data ?? []).filter((v) => v.driver_id === r.id && v.is_active).map((v) => v.registration_number).join(", ") || "Not assigned" },
      ]}
    />
  );
}
