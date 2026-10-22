import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function Section({ n, title, children, defaultOpen = true, right }: { n?: number | string; title: string; children: ReactNode; defaultOpen?: boolean; right?: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-lg border bg-card">
      <div className="flex items-center gap-3 px-4 py-3">
        <button type="button" onClick={() => setOpen(!open)} className="flex flex-1 items-center gap-3 text-left">
          {n != null && <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{n}</span>}
          <span className="font-semibold">{title}</span>
          <ChevronDown className={cn("ml-auto h-4 w-4 transition-transform", open && "rotate-180")} />
        </button>
        {right}
      </div>
      {open && <div className="border-t p-4">{children}</div>}
    </section>
  );
}

export const selectCls = "h-9 w-full rounded-md border border-input bg-card px-2 text-sm";
