import { Input } from "@/components/ui/input";
import { Field } from "./ui";

export type PartyFreightValues = { weight?: string; rate?: string; freight_amount?: string; shortage?: string; addition?: string; freight_date?: string };

export function PartyFreightFields({ label, values, onChange, weightUnit = "kg" }: { label: string; values: PartyFreightValues; onChange: (patch: Partial<PartyFreightValues>) => void; weightUnit?: string }) {
  const fields = [{ key: "weight", label: `Weight (${weightUnit})` }, { key: "rate", label: "Rate (₹)" }, { key: "freight_amount", label: "Freight (₹)" }, { key: "shortage", label: "Shortage (₹)" }, { key: "addition", label: "Addition (₹)" }] as const;
  return <div className="grid min-w-0 gap-3 sm:grid-cols-3">
    {fields.map((f) => <Field key={f.key} label={f.label}><Input aria-label={`${label} ${f.label}`} type="number" inputMode="decimal" min="0" step="0.01" value={values[f.key] ?? ""} onChange={(e) => onChange({ [f.key]: e.target.value })} /></Field>)}
    <Field label="Date"><Input aria-label={`${label} Date`} type="date" value={values.freight_date ?? ""} onChange={(e) => onChange({ freight_date: e.target.value })} /></Field>
  </div>;
}