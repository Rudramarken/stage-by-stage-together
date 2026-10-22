const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatINR(value: number | string | null | undefined): string {
  const n = typeof value === "string" ? Number(value) : value ?? 0;
  return inr.format(Number.isFinite(n) ? (n as number) : 0);
}

/** DD/MM/YYYY in Asia/Kolkata. Accepts YYYY-MM-DD (date-only) or ISO timestamps. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-");
    return `${d}/${m}/${y}`;
  }
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit", year: "numeric" }).format(dt);
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export function todayIST(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

export function maskAccount(num: string | null | undefined): string {
  if (!num) return "—";
  const s = num.replace(/\s/g, "");
  return s.length <= 4 ? s : `XXXX${s.slice(-4)}`;
}

/** Balance label: positive = receivable (owed to Gokul), negative = payable (Gokul owes). */
export function balanceLabel(balance: number): { text: string; tone: "success" | "warning" | "muted" } {
  if (balance > 0.004) return { text: `${formatINR(balance)} Receivable`, tone: "success" };
  if (balance < -0.004) return { text: `${formatINR(-balance)} Payable`, tone: "warning" };
  return { text: "Settled (₹0)", tone: "muted" };
}

export function toCSV(rows: (string | number | null | undefined)[][]): string {
  return rows.map((r) => r.map((c) => {
    const s = c == null ? "" : String(c);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(",")).join("\n");
}

export function downloadCSV(filename: string, rows: (string | number | null | undefined)[][]) {
  const blob = new Blob([toCSV(rows)], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
