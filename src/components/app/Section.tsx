import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function Section({ n, title, children, defaultOpen = true, right }: { n?: number | string; title: string; children: ReactNode; defaultOpen?: boolean; right?: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  const contentId = useId();
  return (
    <section className="rounded-lg border bg-card">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-3 py-2 sm:px-4">
        <h2 className="min-w-0"><Button variant="ghost" type="button" aria-expanded={open} aria-controls={contentId} onClick={() => setOpen(!open)} className="h-auto min-h-11 w-full justify-start whitespace-normal px-1 text-left">
          {n != null && <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{n}</span>}
          <span className="min-w-0 break-words font-semibold">{title}</span>
          <ChevronDown className={cn("ml-auto h-4 w-4 transition-transform", open && "rotate-180")} />
        </Button></h2>
        {right}
      </div>
      <div id={contentId} hidden={!open} className="min-w-0 border-t p-4">{open && children}</div>
    </section>
  );
}

export const selectCls = "h-11 w-full min-w-0 rounded-md border border-input bg-card px-3 text-base transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 sm:text-sm";
