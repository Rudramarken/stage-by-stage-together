import { toast } from "sonner";
import { downloadCSV, todayIST } from "@/lib/format";

type Cell = string | number | null | undefined;

/** Two-decimal money cell for CSV (plain number text so Excel can sum it). */
export const money2 = (n: number | string | null | undefined) => (Number.isFinite(Number(n)) ? Number(n ?? 0).toFixed(2) : "0.00");

/** "my report" -> "my-report-2026-10-28.csv" (IST date). */
export function exportFileName(base: string, date = todayIST()): string {
  const slug = base.trim().replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "export";
  return `${slug}-${date}.csv`;
}

/**
 * Download rows (first row = headers) as CSV. Reports empty results and failures instead of failing silently.
 * Returns true only when a file was actually produced.
 */
export function exportRows(base: string, rows: Cell[][]): boolean {
  if (rows.length < 2) { toast.info("Nothing to export for the current filters."); return false; }
  try {
    downloadCSV(exportFileName(base), rows);
    toast.success(`Exported ${rows.length - 1} row(s)`);
    return true;
  } catch (e) {
    toast.error(`Export failed: ${e instanceof Error ? e.message : "unknown error"}`);
    return false;
  }
}
