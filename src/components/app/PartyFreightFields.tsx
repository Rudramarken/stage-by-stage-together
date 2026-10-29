import { Input } from "@/components/ui/input";
import { Field } from "./ui";

export type PartyFreightValues = { weight?: string; rate?: string; freight_amount?: string; shortage?: string; addition?: string; freight_date?: string };

/** Freight = Weight × Rate (rate is per the shown weight unit), rounded to paise. Null when either value is missing/invalid. */
export function autoFreight(weight?: string, rate?: string): string | null {
  if (String(weight ?? "").trim() === "" || String(rate ?? "").trim() === "") return null;
  const w = Number(weight), r = Number(rate);
  if (!Number.isFinite(w) || !Number.isFinite(r) || w < 0 || r < 0) return null;
  // Work in paise-scaled integers to avoid float drift (e.g. 196.70 × 170 = 33439).
  const paise = Math.round(Math.round(w * 1000) * Math.round(r * 100) / 1000);
  return String(paise / 100);
}

/** Editing Weight or Rate recalculates Freight; typing in Freight directly is kept as a manual value until Weight/Rate change again. */
export function freightPatch(values: PartyFreightValues, patch: Partial<PartyFreightValues>): Partial<PartyFreightValues> {
  if (patch.weight === undefined && patch.rate === undefined) return patch;
  const f = autoFreight(patch.weight ?? values.weight, patch.rate ?? values.rate);
  return f == null ? patch : { ...patch, freight_amount: f };
}

export function PartyFreightFields({ label, values, onChange, weightUnit = "kg" }: { label: string; values: PartyFreightValues; onChange: (patch: Partial<PartyFreightValues>) => void; weightUnit?: string }) {
  const fields = [{ key: "weight", label: `Weight (${weightUnit})` }, { key: "rate", label: `Rate (₹ per ${weightUnit})` }, { key: "freight_amount", label: "Freight (₹)" }, { key: "shortage", label: "Shortage (₹)" }, { key: "addition", label: "Addition (₹)" }] as const;
  return <div className="grid min-w-0 gap-3 sm:grid-cols-3">
    {fields.map((f) => <Field key={f.key} label={f.label} hint={f.key === "freight_amount" ? "Weight × Rate; you can change it" : undefined}><Input aria-label={`${label} ${f.label}`} type="number" inputMode="decimal" min="0" step="0.01" value={values[f.key] ?? ""} onChange={(e) => onChange(freightPatch(values, { [f.key]: e.target.value }))} /></Field>)}
    <Field label="Date"><Input aria-label={`${label} Date`} type="date" value={values.freight_date ?? ""} onChange={(e) => onChange({ freight_date: e.target.value })} /></Field>
  </div>;
}
