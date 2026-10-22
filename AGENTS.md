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
