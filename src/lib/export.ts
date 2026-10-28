import { toast } from "sonner";
import { downloadCSV, todayIST } from "@/lib/format";

type Cell = string | number | null | undefined;

/** Two-decimal money cell for CSV (plain number text so Excel can sum it). */
export const money2 = (n: number | string | null | undefined) => (Number.isFinite(Number(n)) ? Number(n ?? 0).toFixed(2) : "0.00");

/** "my report" -> "my-report-2026-10-28.csv" (IST date). */
export function exportFileName(base: string, date = todayIST(), ext = "csv"): string {
  const slug = base.trim().replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "export";
  return `${slug}-${date}.${ext}`;
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

// ---------------------------------------------------------------------------------------------------------
// Excel export without a new dependency: SpreadsheetML 2003 (one worksheet). Excel and LibreOffice open it directly.
// Numbers are real numeric cells (money columns formatted #,##0.00), text stays text, so LR numbers such as 00123 are not mangled.

const xmlEscape = (s: string) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const safeSheetName = (s: string) => (s.replace(/[\[\]:*?/\\]/g, " ").trim().slice(0, 31) || "Sheet1");

export function toSpreadsheetML(sheetName: string, rows: Cell[][], moneyCols: number[] = []): string {
  const money = new Set(moneyCols);
  const cell = (c: Cell, i: number): string => {
    if (c == null || c === "") return "<Cell/>";
    if (typeof c === "number" && Number.isFinite(c)) return `<Cell${money.has(i) ? ' ss:StyleID="m"' : ""}><Data ss:Type="Number">${c}</Data></Cell>`;
    return `<Cell><Data ss:Type="String">${xmlEscape(String(c))}</Data></Cell>`;
  };
  const xmlRows = rows.map((r) => `<Row>${r.map(cell).join("")}</Row>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<?mso-application progid="Excel.Sheet"?>\n`
    + `<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">`
    + `<Styles><Style ss:ID="m"><NumberFormat ss:Format="#,##0.00"/></Style></Styles>`
    + `<Worksheet ss:Name="${xmlEscape(safeSheetName(sheetName))}"><Table>${xmlRows}</Table></Worksheet></Workbook>`;
}

function downloadBlob(filename: string, blob: Blob) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export type ExportTable = { rows: Cell[][]; moneyCols: number[]; sheetName: string };

/** Download one table as Excel (.xls, SpreadsheetML). Returns true only when a file was produced. */
export function exportExcel(base: string, t: ExportTable): boolean {
  if (t.rows.length < 2) { toast.info("Nothing to export for the current filters."); return false; }
  try {
    downloadBlob(exportFileName(base, todayIST(), "xls"), new Blob([toSpreadsheetML(t.sheetName, t.rows, t.moneyCols)], { type: "application/vnd.ms-excel;charset=utf-8" }));
    toast.success("Excel file downloaded");
    return true;
  } catch (e) {
    toast.error(`Export failed: ${e instanceof Error ? e.message : "unknown error"}`);
    return false;
  }
}
