# Gokul Cargo Movers — Final Trip, Ledger & Expense Fix Report

Verified 3 November 2026 against the signed-in application and persisted Lovable Cloud records. No real customer or transporter records were changed for testing. Latest preview build: OK. Automated suite: **140/140 tests passed, 26 files**.

## Discovered issues and repairs

1. **Optional LR transporter reasons were incorrectly mandatory.** LRForm and the trip LR draft validator rejected positive shortage/addition without a reason. Removed those validation requirements, preserved amount validation and existing reason columns. Draft reason labels now say optional. Standalone TEST Bilties saved both with and without reasons.
2. **Independent trip journeys had no reason storage or controls.** Added nullable `shortage_reason` and `addition_reason` to `trip_journey_entries`, extended the existing atomic save function, added optional inputs and detail display. Editing retains the journey ID and updates the reason.
3. **Fixed trip expenses lacked per-row date and paid-to controls, and saved payloads omitted these fields.** Added the controls to TOLL TAX/CNG/FOOD/POLICE, and send each row's date and paid-to for both fixed and additional expenses. Existing IDs, accounts, methods, references and notes remain intact. New controls start with today's date; existing dates load unchanged. Blank dates retain the established trip-date fallback.
4. **Ledger source enrichment omitted journey links, driver receipt references and transporter adjustment explanations.** LedgerTable now reads only source IDs from the selected account's ledger and adds optional transporter reason/amount details, driver/party/method/notes/reference and trip links. Reason changes do not create additional financial lines. Linked LR transporter amounts/reasons also appear directly on trip details.
5. **Cancelled trip expense history omitted its reason.** The expense history now shows the saved cancellation reason alongside the cancellation status.

## Existing accounting confirmed, not rewritten

- Direct party-to-driver entries already use the atomic `driver_transactions` save path, posting a driver debit and party credit, with no company account. The new enrichment fixes missing reference/context in the ledger display. Active persisted direct receipts all had their matching driver posting.
- Driver receipts remain separate from company-funded advances and salary advance recovery. No artificial Cash/Bank receipt was introduced.
- Transporter ledger selection already filters `account_type` and exact `account_id`. Full persisted-source audits found **zero mismatches** between transporter ledger IDs and LR, journey, payment, advance, manual, commission or commission-receipt source transporter IDs. No duplicate source/source-ID/line-kind groups were found.
- Actual records are named **BAWA SIMRAN TPT** and **BAL KISHAN TPT DELHI**. Their read-only balances were respectively ₹54,624 payable and ₹0; records were not reassigned or merged. “VALKISHAN” was represented by a clearly marked TEST counterpart, not assumed to be the real BAL KISHAN account.
- No evidence reproduced the reported historical mixing at the source-ID level. The business meaning of a historical transporter selection cannot be proven from an ID match alone; any specific incorrectly assigned real LR still needs the owner's identification before reassignment.
- Negative net freight in the settlement summary intentionally means receivable, as its existing label states. This is not a posting-direction bug and was left unchanged. Period filters apply to the ledger statement, while settlement totals remain all-history.

## Database changes

Applied and verified `drizzle/migrations/0038_optional_journey_transporter_reasons.sql`:
- Nullable journey reason columns.
- Extended `save_trip_journeys(jsonb)` inserts and conflict updates for both reasons.
- Retained authenticated/service-role execution and revoked public/anonymous execution.

No RLS, role, authentication, financial amount direction or historical mapping changes. No table, column or financial history deleted. Existing `lrs`, `expenses`, `driver_transactions`, `ledger_entries` and `account_movements` structures were inspected; only the journey schema/function changed.

## Actual signed-in tests

| Scenario | Result |
| --- | --- |
| TEST TRP-0018: main BAWA ₹2,100, return VALKISHAN ₹3,200 | Two independent journey rows and one matching debit per transporter; no automatic Bilty creation |
| Main shortage ₹100 / addition ₹200 with reasons | Saved, reopened; shortage reason edited to “TEST revised damage” on same ID |
| Return shortage ₹50 / addition ₹60 without reasons | Saved successfully |
| TEST SWAROOPNAGAR pays TEST driver ₹15,000 directly | One driver debit ₹15,000 and one party credit ₹15,000; both read back through visible ledgers with reference |
| Company account impact of direct receipt | Account ID null; no `account_movements` row for the receipt |
| Separate expense dates/accounts | TOLL TAX ₹110 on 01-11-2026 and CNG ₹220 on 02-11-2026; both assigned TEST NOV3 BANK; persisted dates and source movements checked |
| Edit same trip | TOLL TAX changed to 03-11-2026; same expense, journey and receipt IDs/counts and same financial-line count; reason changed without duplicate postings |
| Transporter UI separation | BAWA statement showed only its journey and revised reason; VALKISHAN statement did not show BAWA's reason |
| LR with reasons | LR-0039 and LR-0040 saved ₹610 payable with shortage/addition and saved reasons |
| LR without reasons | LR-0041 saved ₹720 payable with shortage/addition and blank reasons |
| Linked independent Bilties | Explicitly linked after separate saves; trip detail and transporter statement showed saved reasons, without copying journey values |
| Trip cancellation through visible Actions menu | Required reason confirmed; trip, three linked LRs, journey rows, expenses and direct receipt cancelled; reversal history retained |
| Final cleanup | Both TEST transporter ledgers, TEST party and TEST driver exactly zero; no active TEST bank movements; five TEST masters archived |

LR-0040 was an extra **separate TEST submission** while correcting a browser selector that incorrectly expected the LR number to be a heading. Both LR-0039 and LR-0040 saved successfully; this was not a repeated trip-save duplicate. All three Bilties were included in cleanup. Document numbers remain consumed by design.

Initial regression tests reproduced the mandatory-reason and fixed-date payload failures before fixes; the same tests passed afterwards. Added journey reason round-trip coverage. Existing ₹15,000 posting/account-exclusion tests also passed. The main save/edit/ledger browser run reported no page errors. Screenshots reviewed for New Trip, driver ledger, party ledger, transporter ledger and cancellation history.

## Files changed

- `src/components/app/LRForm.tsx`, `TripLrSection.tsx`, `TripForm.tsx`, `TripJourneys.tsx`, `LedgerTable.tsx`, `MoneyEditors.tsx`
- `src/routes/_authenticated/trips.$id.index.tsx`
- `src/lib/trip-lrs.ts`, `trip-expenses.ts`, `trip-journeys.ts`, `schema-smoke.ts`
- Tests: `trip-lrs.test.ts`, `trip-expenses.test.ts`, `trip-journeys.test.ts`
- Applied migration above; generated database types refreshed by the migration tool.
- Architecture guidance, roadmap and this report.

## Limits and remaining actions

- No manual backend action is required for these changes. Frontend changes are in preview; publishing was not requested.
- Actual BAWA/BAL KISHAN history was audited read-only; new financial tests used TEST counterparts only. No historical mapping was guessed or repaired.
- The test bank's persisted expense movements/dates and final zero effect were checked; its standalone statement screen was not separately exercised in this pass. New transporter payment/receipt/allocation combinations were not individually rerun; persisted mapping audits covered them, and existing automated tests passed.
- Previous unrelated audit limits remain: staff/admin/second-business sessions, hosted auth settings, and identification of historical paid expenses without accounts. Nothing here claims those are verified.
- Separate manual typechecking/build commands were not run; the managed preview build passed, and all automated tests passed.