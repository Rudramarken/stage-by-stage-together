# Accounting repair — 28 October 2026

## Findings and root causes

1. **Manual transporter entries:** The reported save failure was not reproduced in the current signed-in preview. The live table, save/reverse functions, read policy and enabled posting trigger already exist. A new ₹100 credit appeared in both the manual list and ledger before changes. No missing-schema repair or historical backfill was needed. Confirmed code weaknesses: summary and manual-list queries used unpaginated reads (API limit can hide later entries), a selected statement period can exclude a newly saved entry, and the manual form lacked an immediate click guard. Fixed these without changing accounting conventions. The original client's missing entry cannot be conclusively explained without its account/date.

2. **Add Bank Account:** The current preview already contained the button and authenticated save form. The published application is older: recursively inspected 131 published script assets and found neither `Add Bank Account` nor `Edit account & opening balance`, while the current signed-in preview visibly has both. This explains missing account controls on the live version; missing controls were not a live schema problem. Updated the form to invoke the authenticated save through `useServerFn`.

3. **Opening editor:** Same deployment mismatch. Preview creation and editing persist to the existing account row; opening amounts are not new financial events. Bank edits allow details/opening/date; permanent Cash identities remain unchanged and expose opening-only edits. Owner/Admin controls and RLS were preserved.

## Files changed

- `src/components/app/AccountDialog.tsx`: documented server-function invocation pattern.
- `src/components/app/TransporterLedgerTools.tsx`: immediate repeat-click guard, stable form identity while pending, awaited refresh, paginated manual list and save callback.
- `src/routes/_authenticated/transporter-settlements.tsx`: paginated summary, visible summary errors and all-history selection after adding/editing a manual entry.
- `src/lib/transporter-ledger.test.ts`: concrete credit, debit and reversal accounting tests.
- `AGENTS.md`, `roadmap.md`, this report: constraints and verified status.

## Database and migration status

- Inspected actual account/manual-entry schema, RLS policies, constraints, indexes and triggers; functions compared with migration 0019 and account balance functions.
- **No new migration created or applied.** Required schema/functions are already present. No schema-cache reload needed.
- No RLS relaxation, privileged bypass, real-data repair or historical backfill.

## Actual verification

Signed-in Chromium at `http://localhost:8080`, using the real connected database:

- New TEST transporter credit ₹100: both lists populated, debit ₹0/credit ₹100, payable ₹100.
- Added debit ₹40 while September filter was selected: successful save revealed all history, debit/credit totals ₹40/₹100, payable ₹60.
- Edited that debit to ₹50: same saved row and ledger line, payable ₹50; both entries persisted after refresh/reopening.
- Two concurrent retries of the existing debit's stable UUID succeeded with the same ID; no additional manual rows or source lines.
- Reversed debit and credit through their UI actions: originals retained, offsetting lines retained, totals ₹150 debit/₹150 credit, closing ₹0.
- New TEST bank created through UI with name/bank/number/IFSC, opening ₹100 dated 01/10/2026; real card appeared and persisted.
- Opening edited through UI to ₹125 dated 02/10/2026; refresh retained date and value; card and statement both showed ₹125.
- New bank was selectable in the receipt form. UI receipt ₹5 produced card and statement ₹130 after reload. Reversed the TEST receipt via the authenticated normal removal RPC; balance returned to ₹125.
- Reset only the TEST bank opening to zero using its editor; archived TEST bank/transporter through authenticated updates, preserving all test reversal history.
- Existing Cash, Cash Received by Narinder, GOKUL CARGO MOVERS, SUNIL KUMAR, SUNIL PNB and UDIT CARGO MOVERS remained separate with their original IDs/openings. Existing money was not edited.
- No page errors in full manual/bank flow. Screenshot review confirmed controls, persisted amounts and reversal rows.
- **109/109 tests passed across 20 files.** Latest automatic build signal: `build OK` (12:32:20 UTC). No separate manual build or typecheck was run; the platform handles automatic build/static verification.

## Limitations and next action

- **Not published.** User requested implementation, not publication. The new controls and this repair are verified in preview; publishing latest changes is required for the live website. No manual coding or SQL is required.
- Owner session was tested. Admin/Staff and another business's sessions were not impersonated; authorization inspected in RLS/RPC definitions only.
- Simultaneous first-ever creates and retry-after-network-timeout were not stress-tested; stable IDs, unique keys and UI guard remain in place.
- No specific originally missing manual record was identified. Current save/read path works; report does not claim that unknown historical record was recovered.
- Existing unassigned ₹645 expense and ₹5,000 advance warnings remain unchanged: their original records lack a chosen payment account. Assigning them was outside these three fixes and would alter real account balances.

## Preservation

No real customer, transporter, account, opening balance or transaction history was deleted or rewritten. Only clearly named TEST effects were created, edited, reversed and archived. No opening ledger event was created; existing financial conventions and permission boundaries remain intact.