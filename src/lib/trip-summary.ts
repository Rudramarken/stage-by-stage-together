// Pure trip financial summary (no network, no React) so it can be unit-tested. It reads only records already loaded from the database.
// It deliberately follows the same rules as calcLrProfit() in lr-summary.ts so the LR page and the Trip page can never disagree.

const r2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const sum = <T,>(a: T[], f: (x: T) => number) => r2(a.reduce((s, x) => s + f(x), 0));

export type SummaryLeg = {
  trip: { status?: string | null; vehicle_mode?: string | null; transporter_id?: string | null; commission_enabled?: boolean | null; commission_amount?: number | string | null };
  lrs: any[];
  /** Non-cancelled expenses of this leg (trip-scope and LR-scope), already de-duplicated. */
  expenses: any[];
  /** Non-cancelled advances of this leg. */
  advances: any[];
  /** commission_balances rows of this leg (trip-level and LR-level). */
  commissions: any[];
  /** Non-reversed payments tagged to this trip (informational only). */
  payments?: any[];
  driverTransactions?: any[];
};

export type TripFinancials = {
  activeLrCount: number;
  customerFreight: number | null;
  directPaid: number;
  transporterPayable: number | null;
  commissionEarned: number;          // commission counted in profit (never double counted)
  commissionReceived: number;
  commissionPending: number;
  tripExpenses: number;              // trip-scope, borne by Gokul
  lrExpensesGokul: number;           // consignor / consignee level, borne by Gokul
  expensesChargedToParty: number;    // recoverable from a party: not Gokul's cost
  expenseRecords: number;            // how many Gokul expense records exist (0 => nothing recorded)
  operatingExpenses: number;         // tripExpenses + lrExpensesGokul
  driverAdvances: number;
  transporterAdvances: number;
  customerPayments: number;          // tagged to this trip; informational, never added to profit
  transporterPayments: number;       // tagged to this trip; informational, never added to profit
  profit: number | null;
  state: "calculated" | "provisional" | "incomplete";
  missing: string[];                 // inputs that are absent
  notes: string[];                   // how the figure was built / caveats
};

export function summarizeTrip(legs: SummaryLeg[]): TripFinancials {
  const activeLegs = legs.filter((l) => l.trip.status !== "cancelled");
  const active = activeLegs.flatMap((l) => l.lrs.filter((x) => x.status !== "cancelled"));
  const expenses = activeLegs.flatMap((l) => l.expenses).filter((e) => !e.is_cancelled);
  const advances = activeLegs.flatMap((l) => l.advances).filter((a) => !a.is_cancelled);
  const payments = activeLegs.flatMap((l) => l.payments ?? []).filter((p) => !p.is_reversed);
  const commissions = activeLegs.flatMap((l) => l.commissions).filter((c) => !c.is_cancelled);

  const freight = sum(active, (x) => num(x.final_freight));
  const payable = sum(active, (x) => x.transporter_freight_direction === "receivable" ? -num(x.freight_payable) : num(x.freight_payable));
  const directPaid = sum(active, (x) => (x.direct_payment_enabled ? Math.min(num(x.direct_payment_amount), num(x.final_freight)) : 0));

  // Commission counted once. LR-level commission is already inside (freight - payable) when the consignee paid the driver directly.
  const lrCommission = sum(active, (x) => (x.commission_enabled && !x.direct_payment_enabled ? num(x.commission_amount) : 0));
  const tripCommission = sum(activeLegs, (l) => (l.trip.commission_enabled ? num(l.trip.commission_amount) : 0));
  const commissionEarned = r2(lrCommission + tripCommission);

  const gokul = expenses.filter((e) => e.responsible === "gokul");
  const driverExpenses = sum(activeLegs.flatMap(l => l.driverTransactions ?? []).filter(r => !r.is_cancelled && r.kind === "expense"), r => num(r.amount));
  const tripExpenses = r2(sum(gokul.filter((e) => e.scope === "trip"), (e) => num(e.amount)) + driverExpenses);
  const lrExpensesGokul = sum(gokul.filter((e) => e.scope !== "trip"), (e) => num(e.amount));
  const expensesChargedToParty = sum(expenses.filter((e) => e.responsible === "party"), (e) => num(e.amount));

  const missing: string[] = [];
  const notes: string[] = [];
  const hasFreight = active.length > 0 && (freight > 0 || payable < 0);
  if (!hasFreight) missing.push("Customer freight (no active LR with freight is linked to this trip)");

  const needsPayable = activeLegs.some((l) => l.trip.vehicle_mode === "market" || !!l.trip.transporter_id) || active.some((x) => !!x.transporter_id);
  if (hasFreight && needsPayable && !(payable > 0)) missing.push("Transporter freight payable (a market truck / transporter is used but no payable is recorded)");

  const expenseRecords = gokul.length;
  if (hasFreight && expenseRecords === 0) missing.push("Trip expenses (none recorded - they are not assumed to be zero)");

  if (activeLegs.some((l) => l.trip.status === "draft" || l.trip.status === "booked" || l.trip.status === "in_transit")) notes.push("The trip is not delivered/completed yet, so more entries may still be added.");
  if (commissionEarned > 0) notes.push("Commission earned is counted once and is not the same as commission received.");
  if (tripCommission > 0 && active.some((x) => x.direct_payment_enabled)) notes.push("Trip-level commission is added once; check it if the consignee paid the driver directly.");
  notes.push("Driver advances are payments to the driver, not operating expenses, so they are not deducted.");
  notes.push("Customer receipts and transporter payments only settle receivables/payables; they are not income or expense.");
  if (activeLegs.length > 1) notes.push("All legs are added once each.");

  const operatingExpenses = r2(tripExpenses + lrExpensesGokul);
  const profit = hasFreight ? r2(freight - payable + commissionEarned - operatingExpenses) : null;
  const state: TripFinancials["state"] = !hasFreight ? "incomplete" : missing.length > 0 ? "provisional" : activeLegs.some((l) => ["draft", "booked", "in_transit"].includes(String(l.trip.status))) ? "provisional" : "calculated";

  return {
    activeLrCount: active.length,
    customerFreight: hasFreight ? freight : null, directPaid,
    transporterPayable: hasFreight ? payable : null,
    commissionEarned,
    commissionReceived: sum(commissions, (c) => num(c.received_amount)),
    commissionPending: sum(commissions, (c) => num(c.pending_amount)),
    tripExpenses, lrExpensesGokul, expensesChargedToParty, expenseRecords, operatingExpenses,
    driverAdvances: sum(advances.filter((a) => a.recipient_type === "driver"), (a) => num(a.amount)),
    transporterAdvances: sum(advances.filter((a) => a.recipient_type !== "driver"), (a) => num(a.amount)),
    customerPayments: sum(payments.filter((p) => p.payment_type === "customer_receipt" || p.payment_type === "third_party_receipt"), (p) => num(p.amount)),
    transporterPayments: sum(payments.filter((p) => p.payment_type === "transporter_payment" || p.payment_type === "advance_paid"), (p) => num(p.amount)),
    profit, state, missing, notes,
  };
}
