import { pageHead } from "@/lib/page-head";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Eye } from "lucide-react";
import { MasterCrud } from "@/components/app/MasterCrud";
import { StatusBadge } from "@/components/app/ui";
import { Button } from "@/components/ui/button";

export const PARTY_ROLES = [
  { value: "customer", label: "Customer" },
  { value: "supplier", label: "Supplier" },
  { value: "transporter", label: "Truck Owner / Transporter" },
  { value: "broker", label: "Broker" },
  { value: "other", label: "Other" },
];

export const Route = createFileRoute("/_authenticated/parties/")({
  head: () => pageHead("Parties — Gokul Cargo Movers", "Parties records for Gokul Cargo Movers transport management."),
  component: PartiesPage,
});

function PartiesPage() {
  const [role, setRole] = useState("");
  return (
    <MasterCrud table="parties" title="Parties" singular="Party" orderBy="name"
      description="Customers, suppliers, truck owners and brokers."
      searchKeys={["name", "phone", "alt_phone", "city"]}
      filters={
        <select className="h-9 rounded-md border border-input bg-card px-2 text-sm" value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="">All roles</option>
          {PARTY_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
      }
      filterFn={(r) => !role || (r.roles ?? []).includes(role)}
      defaults={{ roles: ["customer"], opening_type: "none", opening_balance: 0 }}
      validate={(v) => {
        if (v.opening_type !== "none" && !(Number(v.opening_balance) > 0)) return "Enter an opening balance amount greater than 0, or choose None";
        if (v.opening_type !== "none" && !v.opening_date) return "Opening balance date is required";
        return null;
      }}
      transform={(v) => ({ ...v, opening_balance: v.opening_type === "none" ? 0 : Number(v.opening_balance ?? 0) })}
      fields={[
        { name: "name", label: "Party name", required: true },
        { name: "roles", label: "Roles", type: "multi", options: PARTY_ROLES, required: true },
        { name: "contact_person", label: "Contact person" },
        { name: "phone", label: "Phone" },
        { name: "alt_phone", label: "Alternate phone" },
        { name: "city", label: "City" },
        { name: "state", label: "State" },
        { name: "address", label: "Address", type: "textarea" },
        { name: "opening_type", label: "Opening balance type", type: "select", hint: "Old balance before using this app. Never counted as revenue.",
          options: [{ value: "none", label: "None" }, { value: "receivable", label: "Receivable (party owes Gokul)" }, { value: "payable", label: "Payable (Gokul owes party)" }] },
        { name: "opening_balance", label: "Opening balance (₹)", type: "number", showIf: (v) => v.opening_type !== "none" },
        { name: "opening_date", label: "Opening balance date", type: "date", showIf: (v) => v.opening_type !== "none" },
        { name: "notes", label: "Notes", type: "textarea" },
      ]}
      columns={[
        { label: "Name", render: (r) => <Link to="/parties/$id" params={{ id: r.id }} className="font-medium text-info hover:underline">{r.name}</Link> },
        { label: "Roles", render: (r) => <div className="flex flex-wrap gap-1">{(r.roles ?? []).map((x: string) => <StatusBadge key={x} tone="info">{PARTY_ROLES.find((p) => p.value === x)?.label ?? x}</StatusBadge>)}</div> },
        { label: "Phone", render: (r) => r.phone ?? "—" },
        { label: "City", render: (r) => r.city ?? "—" },
      ]}
      rowLink={(r) => <Button asChild variant="ghost" size="sm"><Link to="/parties/$id" params={{ id: r.id }}><Eye className="h-4 w-4" /></Link></Button>}
    />
  );
}
