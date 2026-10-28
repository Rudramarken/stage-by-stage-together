// Pure helpers for the consignor / consignee / LR-Bilty rows inside the Trip form (no React, no network).
// Each filled row becomes ONE LR saved through the existing save_lr() function with trip_id set, exactly like the LR form does.
// Nothing here posts money itself: freight is posted by the existing LR triggers, so it is counted once, on the LR.

export type TripLrParty = { id?: string; party_id: string; freight_amount: string; weight?: string; rate?: string; shortage?: string; addition?: string; freight_date?: string };
export type TripLrDraft = {
  key: string;
  /** Set after the LR has been saved once, so pressing Save again updates that LR instead of creating a second one. */
  savedId?: string;
  lr_number: string; goods_description: string; loading_point: string; delivery_point: string;
  /** Freight payable to the trip's transporter for this LR. */
  freight_payable: string;
  transporter_weight?: string; transporter_rate?: string; transporter_shortage?: string; transporter_additions?: string; transporter_freight_date?: string;
  transporter_shortage_reason?: string; transporter_additions_reason?: string;
  consignors: TripLrParty[]; consignees: TripLrParty[];
};

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const has2dp = (n: number) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6;
const key = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Math.random()).slice(2));

export const blankTripLr = (): TripLrDraft => ({
  key: key(), lr_number: "", goods_description: "", loading_point: "", delivery_point: "", freight_payable: "",
  consignors: [{ party_id: "", freight_amount: "" }], consignees: [{ party_id: "", freight_amount: "" }],
});

const partyBlank = (p: TripLrParty) => !p.party_id && ![p.freight_amount, p.weight, p.rate, p.shortage, p.addition, p.freight_date].some((x) => String(x ?? "").trim());
/** True when the row has nothing entered (an untouched row is ignored on save, not an error). */
export const isBlankTripLr = (d: TripLrDraft) =>
  !d.savedId && !d.lr_number.trim() && !d.goods_description.trim() && !d.loading_point.trim() && !d.delivery_point.trim() && !String(d.freight_payable).trim()
  && ![d.transporter_weight, d.transporter_rate, d.transporter_shortage, d.transporter_additions, d.transporter_freight_date].some((x) => String(x ?? "").trim())
  && d.consignors.every(partyBlank) && d.consignees.every(partyBlank);

/** Sum of the freight entered against every consignor/consignee = the LR's freight (same rule as the LR form). */
export const tripLrFreightTotal = (d: TripLrDraft) =>
  r2([...d.consignors, ...d.consignees].reduce((s, p) => { const n = Number(p.freight_amount); return s + (p.freight_amount !== "" && Number.isFinite(n) ? n : 0); }, 0));

/** First problem found in the rows that were filled in, or null. Rows with nothing entered are skipped. */
export function validateTripLrs(drafts: TripLrDraft[]): string | null {
  const used = new Set<string>();
  let n = 0;
  for (const d of drafts) {
    if (isBlankTripLr(d)) continue;
    n++;
    const w = `LR / Bilty ${n}: `;
    if (Number(d.transporter_shortage) > 0 && !d.transporter_shortage_reason?.trim()) return `${w}enter a reason for transporter shortage`;
    if (Number(d.transporter_additions) > 0 && !d.transporter_additions_reason?.trim()) return `${w}enter a reason for transporter addition`;
    for (const p of [...d.consignors, ...d.consignees, { weight: d.transporter_weight, rate: d.transporter_rate, shortage: d.transporter_shortage, addition: d.transporter_additions, freight_date: d.transporter_freight_date }]) {
      for (const f of [p.weight, p.rate, p.shortage, p.addition]) {
        if (String(f ?? "").trim() && (!Number.isFinite(Number(f)) || Number(f) < 0)) return `${w}weight, rate, shortage and addition must be numbers of 0 or more`;
      }
    }
    if (!d.consignors.some((p) => p.party_id) || !d.consignees.some((p) => p.party_id)) return `${w}add at least one consignor and one consignee`;
    if ([...d.consignors, ...d.consignees].some((p) => !p.party_id)) return `${w}choose a party for every consignor/consignee row (or remove the empty row)`;
    for (const p of [...d.consignors, ...d.consignees]) {
      if (String(p.freight_amount).trim() === "") continue;
      const a = Number(p.freight_amount);
      if (!Number.isFinite(a) || a < 0) return `${w}freight amounts must be numbers of 0 or more`;
      if (!has2dp(a)) return `${w}freight amounts can have at most 2 decimal places`;
    }
    if ([...d.consignors, ...d.consignees].every((p) => String(p.freight_amount).trim() === "")) return `${w}enter the freight against at least one consignor or consignee`;
    if (String(d.freight_payable).trim() !== "") {
      const f = Number(d.freight_payable);
      if (!Number.isFinite(f) || f < 0) return `${w}freight payable to the transporter must be 0 or more`;
      if (!has2dp(f)) return `${w}freight payable can have at most 2 decimal places`;
    }
    const no = d.lr_number.trim().toLowerCase();
    if (no) { if (used.has(no)) return `${w}LR number "${d.lr_number.trim()}" is used twice in this trip`; used.add(no); }
  }
  return null;
}

/** save_lr payload: same shape and defaults as blankLR() + the LR form's party-wise freight rule (fixed rate = sum of party freights). */
export function tripLrPayload(d: TripLrDraft, trip: { id: string; trip_date: string; transporter_id?: string | null }): Record<string, unknown> {
  const total = tripLrFreightTotal(d);
  const row = (role: "consignor" | "consignee", p: TripLrParty, i: number) => ({
    id: p.id, weight: p.weight ?? "", rate: p.rate ?? "", shortage: p.shortage ?? "", addition: p.addition ?? "", freight_date: p.freight_date ?? "",
    role, party_id: p.party_id, freight_amount: p.freight_amount === "" ? "" : String(p.freight_amount), expenses: [],
    goods_description: role === "consignor" && i === 0 ? d.goods_description : "",
    loading_point: role === "consignor" && i === 0 ? d.loading_point : "",
    delivery_point: role === "consignee" && i === 0 ? d.delivery_point : "",
  });
  return {
    ...(d.savedId ? { id: d.savedId } : {}),
    lr_number: d.lr_number.trim(), lr_date: trip.trip_date, trip_id: trip.id, transporter_id: trip.transporter_id || "",
    weight_unit: "kg", rate_unit: "fixed", rate: String(total), freight_type: "to_pay", delivery_status: "pending",
    freight_payable: d.freight_payable === "" ? "0" : String(d.freight_payable),
    transporter_weight: d.transporter_weight ?? "", transporter_weight_unit: "kg", transporter_rate: d.transporter_rate ?? "", transporter_rate_unit: "",
    transporter_shortage: d.transporter_shortage ?? "", transporter_additions: d.transporter_additions ?? "", transporter_freight_date: d.transporter_freight_date ?? "",
    transporter_shortage_reason: d.transporter_shortage_reason ?? "", transporter_additions_reason: d.transporter_additions_reason ?? "",
    direct_payment_enabled: false, commission_enabled: false, commission_mode: "percent", commission_status: "pending",
    goods_description: d.goods_description, loading_point: d.loading_point, delivery_point: d.delivery_point,
    parties: [...d.consignors.map((p, i) => row("consignor", p, i)), ...d.consignees.map((p, i) => row("consignee", p, i))],
    adjustments: [],
  };
}
