import type { ReactNode } from "react";

/** Phone-only stacked cards; pair with a table wrapped in `hidden sm:block`. */
export function MobileCards({ children }: { children: ReactNode }) {
  return <ul className="space-y-3 sm:hidden">{children}</ul>;
}

export function MobileCard({ title, aside, actions, children, muted }: { title: ReactNode; aside?: ReactNode; actions?: ReactNode; children?: ReactNode; muted?: boolean }) {
  return (
    <li className={`rounded-lg border bg-card p-4 ${muted ? "border-dashed" : ""}`}>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
        <div className="min-w-0 break-words font-semibold [&_a]:inline-flex [&_a]:min-h-11 [&_a]:items-center">{title}</div>
        <div className="flex shrink-0 items-center">{actions}</div>
      </div>
      {aside && <div className="mb-2 min-w-0 break-words text-base font-semibold">{aside}</div>}
      {children && <div className="min-w-0 space-y-2 break-words text-sm text-muted-foreground">{children}</div>}
    </li>
  );
}

export const dateRangeCls = "grid grid-cols-2 gap-1 [&>input]:min-w-0";
