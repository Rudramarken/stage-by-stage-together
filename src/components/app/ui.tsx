import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { formatINR } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 grid min-w-0 gap-4 border-b pb-5 sm:flex sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="break-words text-2xl font-semibold text-primary sm:text-3xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="no-print grid min-w-0 gap-2 sm:flex sm:shrink-0 sm:flex-wrap [&>button]:whitespace-normal [&>a]:whitespace-normal">{actions}</div>}
    </div>
  );
}

export function Money({ value, className }: { value: number | string | null | undefined; className?: string }) {
  return <span className={cn("tabular whitespace-nowrap", className)}>{formatINR(value)}</span>;
}

const tones: Record<string, string> = {
  success: "bg-success/15 text-success border-success/30",
  warning: "bg-warning/20 text-warning-foreground border-warning/40",
  danger: "bg-destructive/10 text-destructive border-destructive/30",
  info: "bg-accent text-accent-foreground border-info/20",
  muted: "bg-muted text-muted-foreground border-border",
};

export function StatusBadge({ tone = "muted", children }: { tone?: keyof typeof tones | string; children: ReactNode }) {
  return <Badge variant="outline" className={cn("font-medium", tones[tone] ?? tones.muted)}>{children}</Badge>;
}

export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel = "Confirm", onConfirm, destructive }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: ReactNode;
  confirmLabel?: string; onConfirm: () => void; destructive?: boolean;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction className={destructive ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""} onClick={onConfirm}>
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function NotBuiltYet({ title }: { title: string }) {
  return (
    <div>
      <PageHeader title={title} />
      <div className="rounded-lg border border-dashed bg-card p-10 text-center">
        <StatusBadge tone="warning">Not built yet</StatusBadge>
        <p className="mt-3 text-sm text-muted-foreground">This page will be added in a later stage.</p>
      </div>
    </div>
  );
}

export function Field({ label, required, hint, error, children }: { label: string; required?: boolean; hint?: string; error?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}{required && <span className="text-destructive"> *</span>}</span>
      {children}
      {hint && !error && <span className="text-xs text-muted-foreground">{hint}</span>}
      {error && <span className="text-xs text-destructive">{error}</span>}
    </label>
  );
}
