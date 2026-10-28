# Accounts page fix

## Cause and changes
- The account cards on `/payments` had no creation or editing actions. Bank creation existed only under Business Settings.
- Added a visible Add Bank Account button and per-card edit actions. Permanent cash accounts expose opening-balance edits only.
- Added a validated authenticated save function. Name, amount, date and IFSC validation runs in both the browser and server. Optional bank details remain optional, matching the existing schema.
- Creation uses one stable UUID per form, a synchronous submission guard, and the existing business-scoped unique name index. Database RLS remains authoritative for Owner/Admin writes.
- Opening balances update the existing account row; they never generate additional ledger postings. Existing database balance calculations remain unchanged.

## Files
- `src/components/app/AccountCards.tsx`
- `src/components/app/AccountDialog.tsx`
- `src/lib/account-form.ts`
- `src/lib/account-form.test.ts`
- `src/lib/api/accounts.functions.ts`
- `AGENTS.md`, `roadmap.md`, this report

## Database status
Inspected actual account columns, defaults, policies, constraints, triggers, indexes and balance function. All required fields already exist. No migration was required or applied. Built-in cash creation remains prohibited by the established business rules; both existing cash accounts can edit their opening balance.

## Verification
- Signed-in account creation: TEST bank with ₹100 opening dated 28/10/2026 saved and appeared as a card.
- Refresh persistence: account fields and opening balance reloaded.
- Opening edit: ₹125 saved, reloaded and reflected as current balance.
- Duplicate name: rejected with a visible error and retained form.
- Cash opening editor available for the existing Cash account; no real Cash values changed.
- Real ₹5 test receipt, submitted twice using the same payment ID: one payment row; card and statement balance ₹130.
- Opening ledger events for the test account: zero. Statement opening counted once.
- Receipt reversal restored ₹125. Only test opening reset to zero; test account and test party archived. Reversed payment history retained.
- Cash and Cash Received by Narinder remained separate visible cards. Existing bank accounts were not modified.
- Automated suite: 106/106 tests passed; automatic build/type verification passed after correcting the generated Insert typing for trigger-stamped business ID.

## Limits and preserved data
Staff/cross-business denial was inspected through existing RLS rather than tested using another user's session. Existing unassigned expenses/advances still show the established provisional-balance warning; they were not assigned or altered. No real financial records, balances or histories were changed. Changes have not been published.