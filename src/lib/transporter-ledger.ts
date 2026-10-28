// Pure balance logic for the transporter ledger (no database access).
// Ledger sign convention (same as lr_after / payment_after): CREDIT = Gokul owes the transporter, DEBIT = payment made.
export type LedgerLine = { line_kind: string | null; debit: number | string; credit: number | string };

export type TransporterSummary = {
  opening: number;      // +payable / -receivable (opening_balance row)
  freight: number;      // freight payable posted from LRs (+ reversals of payments)
  adjustments: number;  // manual entries: +increase payable / -reduce payable
  paid: number;         // payments, advances and consignee direct payments (debits)
  commissionDue: number; // commission Gokul still has to receive (kept separate, never mixed into payable)
  remaining: number;    // opening + freight + adjustments - paid  (>0 payable, <0 advance/receivable)
};

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function summarizeTransporterLines(lines: LedgerLine[]): TransporterSummary {
  let opening = 0, freight = 0, adjustments = 0, paid = 0, commissionDue = 0;
  for (const l of lines) {
    const d = Number(l.debit) || 0, c = Number(l.credit) || 0, k = String(l.line_kind ?? "");
    if (k.startsWith("commission")) commissionDue += d - c;
    else if (k === "opening_balance") opening += c - d;
    else if (k === "manual" || k === "manual_reversal") adjustments += c - d;
    else { freight += c; paid += d; }
  }
  return { opening: r2(opening), freight: r2(freight), adjustments: r2(adjustments), paid: r2(paid), commissionDue: r2(commissionDue), remaining: r2(opening + freight + adjustments - paid) };
}

export function remainingLabel(n: number): { text: string; tone: "warning" | "success" | "muted" } {
  const f = (v: number) => "₹" + v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (n > 0.004) return { text: `${f(n)} Payable to transporter`, tone: "warning" };
  if (n < -0.004) return { text: `${f(-n)} Advance / receivable from transporter`, tone: "success" };
  return { text: "Settled (₹0)", tone: "muted" };
}
