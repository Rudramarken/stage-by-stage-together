import { Landmark, Wallet, Plus, Pencil } from "lucide-react";
import { useState } from "react";
import { useBusiness } from "@/lib/business";
import type { Tables } from "@/integrations/supabase/types";
import { AccountDialog } from "./AccountDialog";
import { Button } from "@/components/ui/button";
import { Money, StatusBadge } from "./ui";
import { ErrorState, LoadingState, errorMessage } from "./states";
import { useAccounts } from "@/lib/lookups";
import { accountLabel, useAccountBalances, type AccountRow } from "@/lib/accounts";
import { formatDate, maskAccount } from "@/lib/format";

/** Cash accounts first (Cash, then Cash Received by Narinder), then every saved bank account by name. */
export function sortAccounts<T extends Pick<AccountRow, "kind" | "display_name" | "system_key">>(
  list: T[],
): T[] {
  const rank = (a: T) => (a.kind === "cash" ? (a.system_key === "cash" ? 0 : 1) : 2);
  return list
    .slice()
    .sort((a, b) => rank(a) - rank(b) || a.display_name.localeCompare(b.display_name));
}

/**
 * One visible card per account (no dropdown). Reads the real accounts and the balances computed by the database
 * (opening balance + receipts - payments from account_movements). The cards stay visible even if balances cannot be loaded:
 * then the card says so and the real database error is shown above them.
 */
export function AccountCards({
  selectedId,
  onView,
}: {
  selectedId?: string;
  onView: (accountId: string) => void;
}) {
  const accounts = useAccounts();
  const balances = useAccountBalances();
  const { role } = useBusiness();
  const canEdit = role === "owner" || role === "admin";
  const [editing, setEditing] = useState<Tables<"payment_accounts"> | null | undefined>(undefined);
  if (accounts.isPending) return <LoadingState label="Loading accounts…" />;
  if (accounts.isError)
    return <ErrorState error={accounts.error} onRetry={() => accounts.refetch()} />;
  const bal = (id: string) => balances.data?.find((b) => b.account_id === id);
  const list = sortAccounts(accounts.data as AccountRow[]).filter(
    (a) => a.is_active || Number(bal(a.id)?.balance ?? 0) !== 0,
  );
  const total = (balances.data ?? []).reduce((s, b) => s + Number(b.balance), 0);
  return (
    <section aria-label="Cash and bank accounts" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Accounts</h2>
        {canEdit && (
          <Button onClick={() => setEditing(null)}>
            <Plus aria-hidden="true" className="mr-2 h-4 w-4" />
            Add Bank Account
          </Button>
        )}
      </div>
      {balances.isError && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm"
        >
          <p className="font-medium text-destructive">Current balances could not be loaded</p>
          <p className="break-words">{errorMessage(balances.error)}</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => balances.refetch()}>
            Retry
          </Button>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((a) => {
          const b = bal(a.id);
          const used = b ? Number(b.receipts) + Number(b.payments) > 0 : false;
          const Icon = a.kind === "cash" ? Wallet : Landmark;
          return (
            <article
              key={a.id}
              aria-label={accountLabel(a)}
              className={`flex min-w-0 flex-col gap-2 rounded-lg border bg-card p-4 ${a.id === selectedId ? "ring-2 ring-primary" : ""}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <Icon aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <h3 className="min-w-0 break-words font-semibold">{a.display_name}</h3>
                </div>
                <div className="flex shrink-0 flex-wrap justify-end gap-1">
                  <StatusBadge tone={a.kind === "cash" ? "success" : "info"}>
                    {a.kind === "cash" ? "Cash" : "Bank"}
                  </StatusBadge>
                  {!a.is_active && <StatusBadge>Inactive</StatusBadge>}
                </div>
              </div>
              {a.kind === "bank" && (
                <p className="text-xs text-muted-foreground">
                  {[a.bank_name, a.account_number ? maskAccount(a.account_number) : null]
                    .filter(Boolean)
                    .join(" · ") || "Bank account"}
                </p>
              )}
              <div>
                <p className="text-xs text-muted-foreground">Current balance</p>
                <p className="text-2xl font-semibold">
                  {b ? (
                    <Money value={b.balance} />
                  ) : balances.isError ? (
                    <span className="text-sm text-muted-foreground">Unavailable</span>
                  ) : (
                    "…"
                  )}
                </p>
              </div>
              <dl className="grid grid-cols-2 gap-x-3 text-xs">
                <div>
                  <dt className="text-muted-foreground">Opening balance</dt>
                  <dd>
                    <Money value={a.opening_balance ?? 0} />
                    {a.opening_date ? (
                      <span className="block text-muted-foreground">
                        as of {formatDate(a.opening_date)}
                      </span>
                    ) : null}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Received / Paid</dt>
                  <dd>
                    {b ? (
                      <>
                        <Money value={b.receipts} />
                        <span className="block">
                          <Money value={b.payments} />
                        </span>
                      </>
                    ) : (
                      "—"
                    )}
                  </dd>
                </div>
              </dl>
              {b && !used && (
                <p className="text-xs text-muted-foreground">
                  No transactions recorded on or after the opening date yet.
                </p>
              )}
              <Button
                variant={a.id === selectedId ? "default" : "outline"}
                size="sm"
                className="mt-auto"
                onClick={() => onView(a.id)}
              >
                View transactions &amp; statement
              </Button>
              {canEdit && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditing(accounts.data.find((row) => row.id === a.id))}
                >
                  <Pencil aria-hidden="true" className="mr-2 h-4 w-4" />
                  {a.kind === "cash" ? "Edit opening balance" : "Edit account & opening balance"}
                </Button>
              )}
            </article>
          );
        })}
        {balances.data && (
          <div className="flex min-w-0 flex-col justify-center gap-1 rounded-lg border bg-muted p-4">
            <p className="text-xs text-muted-foreground">Total of all accounts above</p>
            <p className="text-2xl font-semibold">
              <Money value={total} />
            </p>
          </div>
        )}
      </div>
      {list.length === 0 && <p className="text-sm text-muted-foreground">No accounts found.</p>}
      {editing !== undefined && (
        <AccountDialog
          key={editing?.id ?? "new"}
          account={editing}
          onClose={() => setEditing(undefined)}
        />
      )}
    </section>
  );
}
