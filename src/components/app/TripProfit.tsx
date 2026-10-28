import type { ReactNode } from "react";
import { Money, StatusBadge } from "./ui";
import { summarizeTrip, type SummaryLeg } from "@/lib/trip-summary";

/** Provisional trip profit built from persisted records only. Missing inputs are named, never shown as a confirmed ₹0. */
export function TripProfit({ legs, label }: { legs: SummaryLeg[]; label: string }) {
  const s = summarizeTrip(legs);
  const badge = s.state === "calculated" ? { tone: "success", text: "Calculated from recorded entries" } : s.state === "provisional" ? { tone: "warning", text: "Provisional" } : { tone: "danger", text: "Incomplete" };
  const money = (v: number | null, missingText = "Not available") => (v == null ? <span className="text-muted-foreground">{missingText}</span> : <Money value={v} />);
  const rows: [string, ReactNode][] = [
    ["Customer freight (billed on active LRs)", money(s.customerFreight)],
    ["− Transporter freight payable", money(s.transporterPayable)],
    ["+ Commission earned (counted once; not the same as received)", <Money key="c" value={s.commissionEarned} />],
    ["− Trip expenses borne by Gokul", s.expenseRecords === 0 ? <span className="text-muted-foreground">Not recorded</span> : <Money key="e" value={s.operatingExpenses} />],
  ];
  return (
    <div className="rounded-lg border bg-background p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2"><p className="text-sm font-semibold text-primary">{label}</p><StatusBadge tone={badge.tone}>{badge.text}</StatusBadge></div>
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        {rows.map(([k, v]) => <div key={k} className="flex items-baseline justify-between gap-3 border-b pb-1"><dt className="text-muted-foreground">{k}</dt><dd className="font-medium">{v}</dd></div>)}
      </dl>
      <p className="mt-3 text-base font-semibold">{s.state === "calculated" ? "Trip profit" : "Provisional trip profit"}: {s.profit == null ? <span className="text-muted-foreground">Not available</span> : <Money value={s.profit} className={s.profit < 0 ? "text-destructive" : ""} />}</p>
      {s.missing.length > 0 && <div className="mt-2 rounded bg-warning/20 p-2 text-sm"><p className="font-medium">Missing inputs</p><ul className="list-disc pl-5">{s.missing.map((m) => <li key={m}>{m}</li>)}</ul></div>}
      <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded border p-2"><p className="text-xs text-muted-foreground">Driver advances (to driver, not an expense)</p><p className="font-medium"><Money value={s.driverAdvances} /></p></div>
        <div className="rounded border p-2"><p className="text-xs text-muted-foreground">Commission received / pending</p><p className="font-medium"><Money value={s.commissionReceived} /> / <Money value={s.commissionPending} /></p></div>
        <div className="rounded border p-2"><p className="text-xs text-muted-foreground">Customer payments tagged to this trip</p><p className="font-medium"><Money value={s.customerPayments} /></p></div>
        <div className="rounded border p-2"><p className="text-xs text-muted-foreground">Transporter payments tagged to this trip</p><p className="font-medium"><Money value={s.transporterPayments} /></p></div>
      </div>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
        {s.expensesChargedToParty > 0 && <li>Expenses charged to a party (<Money value={s.expensesChargedToParty} />) are recoverable from that party and are not counted as Gokul's cost.</li>}
        {s.notes.map((n) => <li key={n}>{n}</li>)}
        <li>Outstanding receivable / payable cannot be determined from trip data alone (payments settle through LR allocations); see the Outstanding and party / transporter ledger pages. Payments are shown only when tagged to this trip and never change profit.</li>
        <li>Shared trip expenses are not split between LRs or legs; every record is counted once.</li>
      </ul>
    </div>
  );
}
