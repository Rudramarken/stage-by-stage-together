<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- Every business table has `business_id` stamped by the `stamp_business_id` trigger from the caller's membership; never send it from the browser. Why: data isolation can't depend on client input.
- RLS uses `is_business_member()` / `has_business_role()` security-definer helpers. Why: avoids recursive policies.
- Ledger lines are written only via `post_ledger()` (upsert on source_table+source_id+line_kind). Why: saving twice or editing never duplicates money.
- Doc numbers come from `next_doc_number(p_business_id, p_doc_type)`. Why: concurrency-safe, prefix-from-settings.
- Server functions live in `src/lib/api/*.functions.ts` (not `src/server/`, which is blocked from client imports).
- Master list pages use `src/components/app/MasterCrud.tsx`; keep `src/lib/schema-smoke.ts` in sync with every column the UI reads.
- Multi-row money saves (LR with parties/adjustments/expenses, trip with stops) go through `save_lr(jsonb)` / `save_trip(jsonb)`; ledger lines are posted by AFTER triggers on lrs/expenses/advances/payments/salary tables via `ledger_set()`. Why: one atomic, idempotent path.
- Self sign-up creates an account with no business access; an Owner approves it (server fn `approveUser`). Why: no one sees data without approval.
- Driver commission sources sync to driver_commissions; commission_receipts is the single cash/salary-recovery history and commission_balances is the RLS-scoped read model. Why: partial settlements, reporting and driver ledgers share one atomic, idempotent source.
- Commission cash receipts and confirmed salary recoveries use driver-level transaction locks; receipt request IDs are unique and cancellations retain offsetting ledger rows. Why: concurrent retries cannot over-receive or silently erase financial history.

- List row actions share RowActions and RemovalDialog; destructive document/master operations use remove_record, and money is reversed, never deleted. Why: consistent pending confirmation and server-side dependency/owner checks.
- LR edits preserve party, expense and adjustment IDs; save RPCs lock the business-scoped document and reject foreign child IDs. Why: editing must update the same records without double amounts.
- Shared controls, navigation and MobileCards own touch sizing and focus treatment; list filters have explicit accessible names. Why: accessibility and phone layouts remain consistent across transport screens.
