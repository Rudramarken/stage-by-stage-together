import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Field } from "./ui";
import { selectCls } from "./Section";
import { MONTH_NAMES, resolvePeriod, type Period, type PeriodMode, type PeriodSelection } from "@/lib/statement";
import { todayIST } from "@/lib/format";

/** State for a statement period: All history, one Month, one Year or a custom date range (DD-MM-YYYY labels, IST today). */
export function usePeriod(initialMode: PeriodMode = "all") {
  const today = todayIST();
  const [sel, setSel] = useState<PeriodSelection>({ mode: initialMode, year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)), from: "", to: "" });
  const period: Period = useMemo(() => resolvePeriod(sel), [sel]);
  return { sel, setSel, period };
}

export function PeriodPicker({ sel, onChange, period, idPrefix = "period" }: { sel: PeriodSelection; onChange: (s: PeriodSelection) => void; period: Period; idPrefix?: string }) {
  const thisYear = Number(todayIST().slice(0, 4));
  const years = Array.from({ length: 12 }, (_, i) => thisYear + 1 - i);
  if (!years.includes(sel.year)) years.push(sel.year);
  const set = (patch: Partial<PeriodSelection>) => onChange({ ...sel, ...patch });
  return (
    <div role="group" aria-label="Statement period" className="no-print space-y-2">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Field label="Period">
          <select aria-label="Period type" id={`${idPrefix}-mode`} className={selectCls} value={sel.mode} onChange={(e) => set({ mode: e.target.value as PeriodMode })}>
            <option value="all">All available history</option>
            <option value="month">Month</option>
            <option value="year">Year (Jan–Dec)</option>
            <option value="range">Custom date range</option>
          </select>
        </Field>
        {(sel.mode === "month") && (
          <Field label="Month">
            <select aria-label="Month" className={selectCls} value={sel.month} onChange={(e) => set({ month: Number(e.target.value) })}>
              {MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </Field>
        )}
        {(sel.mode === "month" || sel.mode === "year") && (
          <Field label="Year">
            <select aria-label="Year" className={selectCls} value={sel.year} onChange={(e) => set({ year: Number(e.target.value) })}>
              {years.sort((a, b) => b - a).map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </Field>
        )}
        {sel.mode === "range" && <>
          <Field label="From date"><Input type="date" aria-label="From date" value={sel.from} onChange={(e) => set({ from: e.target.value })} /></Field>
          <Field label="To date"><Input type="date" aria-label="To date" value={sel.to} onChange={(e) => set({ to: e.target.value })} /></Field>
        </>}
      </div>
      {period.error ? <p role="alert" className="text-sm text-destructive">{period.error}</p> : <p className="text-xs text-muted-foreground">Showing: {period.label}</p>}
    </div>
  );
}
