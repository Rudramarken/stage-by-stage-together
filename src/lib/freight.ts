export type WeightUnit = "kg" | "quintal" | "tonne" | "unit";
export type RateUnit = "per_kg" | "per_quintal" | "per_tonne" | "fixed";
export type Adjustment = { kind: "add" | "deduct"; amount: number; reason: string };

const KG: Record<WeightUnit, number> = { kg: 1, quintal: 100, tonne: 1000, unit: 1 };
const RATE_KG: Record<Exclude<RateUnit, "fixed">, number> = { per_kg: 1, per_quintal: 100, per_tonne: 1000 };

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Mirrors the database calculation (lr_before trigger). */
export function calcFreight(weight: number | null, weightUnit: WeightUnit, rate: number | null, rateUnit: RateUnit, adjustments: Adjustment[] = []) {
  const kg = (weight ?? 0) * KG[weightUnit];
  const base = rateUnit === "fixed" ? r2(rate ?? 0) : r2((kg / RATE_KG[rateUnit]) * (rate ?? 0));
  const additions = r2(adjustments.filter((a) => a.kind === "add").reduce((s, a) => s + Number(a.amount || 0), 0));
  const deductions = r2(adjustments.filter((a) => a.kind === "deduct").reduce((s, a) => s + Number(a.amount || 0), 0));
  return { kg, base, additions, deductions, final: r2(base + additions - deductions) };
}

export function validateFreight(weight: number | null, rate: number | null, rateUnit: RateUnit, adjustments: Adjustment[]): string | null {
  if (rate == null || Number.isNaN(rate)) return "Enter the freight rate";
  if (rate < 0) return "Rate cannot be negative";
  if (rateUnit !== "fixed" && !(Number(weight) > 0)) return "Enter the weight to calculate freight per kg/quintal/tonne";
  if (weight != null && weight < 0) return "Weight cannot be negative";
  for (const a of adjustments) {
    if (!(Number(a.amount) > 0)) return "Every addition/deduction needs an amount greater than 0";
    if (!a.reason?.trim()) return "Every addition/deduction needs a reason";
  }
  return null;
}

export const RATE_UNIT_LABEL: Record<RateUnit, string> = { per_kg: "Per kg", per_quintal: "Per quintal", per_tonne: "Per tonne", fixed: "Fixed per trip" };
