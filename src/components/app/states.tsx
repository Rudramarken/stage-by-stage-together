import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, Inbox, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { explainDbError } from "@/lib/db-errors";

export function LoadingState({ label = "Loading…", timeoutMs = 15000, onRetry }: { label?: string; timeoutMs?: number; onRetry?: () => void }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), timeoutMs);
    return () => clearTimeout(t);
  }, [timeoutMs]);
  return (
    <div role="status" aria-live="polite" className="flex min-h-[200px] flex-col items-center justify-center gap-3 p-8 text-muted-foreground">
      <Loader2 className="h-6 w-6 animate-spin" />
      <p className="text-sm">{slow ? "This is taking longer than usual." : label}</p>
      {slow && (onRetry ? <Button variant="outline" size="sm" onClick={onRetry}>Retry</Button> :
        <Button variant="outline" size="sm" onClick={() => window.location.reload()}>Reload page</Button>)}
    </div>
  );
}

export function errorMessage(e: unknown): string {
  if (!e) return "Unknown error";
  // The real database message is always kept; explainDbError only appends a fix hint for schema-cache / missing-migration errors.
  if (e instanceof Error) return explainDbError(e.message);
  if (typeof e === "object" && e && "message" in e) return explainDbError(String((e as { message: unknown }).message));
  return explainDbError(String(e));
}

export function ErrorState({ error, onRetry, extra }: { error: unknown; onRetry?: () => void; extra?: ReactNode }) {
  return (
    <div role="alert" className="m-4 flex min-w-0 flex-col items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center">
      <AlertTriangle className="h-6 w-6 text-destructive" />
      <p className="font-medium text-destructive">Something went wrong</p>
      <p className="max-w-lg break-words text-sm text-foreground">{errorMessage(error)}</p>
      <div className="flex gap-3">
        {onRetry && <Button variant="outline" size="sm" onClick={onRetry}>Retry</Button>}
        {extra}
      </div>
    </div>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed bg-card p-10 text-center">
      <Inbox className="h-6 w-6 text-muted-foreground" />
      <p className="font-medium">{title}</p>
      {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
