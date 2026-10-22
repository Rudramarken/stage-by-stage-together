import type { ReactNode } from "react";

/** Phone-only stacked cards; pair with a table wrapped in `hidden sm:block`. */
export function MobileCards({ children }: { children: ReactNode }) {
  return <ul className="space-y-2 sm:hidden">{children}</ul>;
}

export function MobileCard({ title, aside, actions, children, muted }: { title: ReactNode; aside?: ReactNode; actions?: ReactNode; children?: ReactNode; muted?: boolean }) {
  return (
    <li className={`rounded-lg border bg-card p-3 ${muted ? "opacity-60" : ""}`}>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
        <div className="min-w-0 break-words font-medium">{title}</div>
        <div className="flex shrink-0 items-center gap-1">{aside}{actions}</div>
      </div>
      {children && <div className="mt-1 min-w-0 space-y-1 break-words text-sm text-muted-foreground">{children}</div>}
    </li>
  );
}

export const dateRangeCls = "grid grid-cols-2 gap-1 [&>input]:min-w-0";
