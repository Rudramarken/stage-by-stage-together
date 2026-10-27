// Pure helpers for the LR / Bilty screens (no network, no React) so they can be unit-tested.

const clean = (x: unknown) => (typeof x === "string" && x.trim() ? x.trim() : null);
const r2 = (n: number) => Math.round(n * 100) / 100;

type VehicleSource = {
  vehicle_number?: string | null;
  trips?: { market_vehicle_number?: string | null; vehicles?: { registration_number?: string | null } | null } | null;
} | null | undefined;

/** Real vehicle registration for an LR: the linked trip's vehicle, else the trip's market vehicle, else the vehicle typed on the LR. null when unknown. */
export function lrVehicleNumber(lr: VehicleSource): string | null {
  return clean(lr?.trips?.vehicles?.registration_number) ?? clean(lr?.trips?.market_vehicle_number) ?? clean(lr?.vehicle_number);
}

export type LrProfitInput = {
  status: string;
  finalFreight: number;
  freightPayable: number;
  hasTransporter: boolean;
  tripLinked: boolean;
  gokulExpenses: number;
  commissionEnabled: boolean;
  commissionAmount: number;
  directPaymentEnabled: boolean;
};
export type LrProfit = {
  state: "calculated" | "provisional" | "insufficient";
  profit: number | null;
  commissionAdded: number;
  notes: string[];
};

/**
 * LR profit = customer freight - transporter freight payable - direct Gokul expenses of this LR + commission earned.
 * Commission is added once, and only when it is not already inside (freight - payable), i.e. not when the consignee paid the driver directly.
 * Shared trip expenses and driver advances are never allocated here (no reliable allocation exists), so a trip-linked LR is Provisional.
 */
export function calcLrProfit(i: LrProfitInput): LrProfit {
  if (i.status === "cancelled") return { state: "insufficient", profit: null, commissionAdded: 0, notes: ["LR is cancelled."] };
  if (!(i.finalFreight > 0)) return { state: "insufficient", profit: null, commissionAdded: 0, notes: ["No customer freight on this LR."] };
  const notes: string[] = [];
  let commissionAdded = 0;
  if (i.commissionEnabled && i.commissionAmount > 0) {
    if (i.directPaymentEnabled) notes.push("Commission is already inside freight minus payable (consignee paid the driver directly), so it is not added again.");
    else commissionAdded = r2(i.commissionAmount);
  }
  const provisional: string[] = [];
  if (i.tripLinked) provisional.push("Shared trip expenses and driver advances are kept in the Trip summary and are not allocated to this LR.");
  if (!i.hasTransporter && !(i.freightPayable > 0)) provisional.push("No transporter freight payable recorded.");
  if (i.commissionEnabled && i.directPaymentEnabled) provisional.push("Commission treatment depends on the direct payment.");
  const profit = r2(i.finalFreight - i.freightPayable - i.gokulExpenses + commissionAdded);
  return { state: provisional.length ? "provisional" : "calculated", profit, commissionAdded, notes: [...notes, ...provisional] };
}
