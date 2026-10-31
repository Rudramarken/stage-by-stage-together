# Complete Client Feedback Audit — Gokul Cargo Movers

Date: 31-10-2026. Existing application retained. Changes are in preview; publication was not requested.

## Issues, causes and changes

1. **Bank entries and opening balances:** existing card controls, authenticated account saves and bank transaction paths work. Verified rather than replacing account identities. Existing Cash, Cash Received by Narinder and real banks remain separate. Opening edits update the account, not an additional ledger event.
2. **Manual party entries:** existing save/reversal functions and paginated ledger reads work. Verified a visible manual entry, stable-ID edit and reload. Manual adjustments deliberately do not create company cash movements.
3. **Independent LR transporters:** new LR drafts already have independent transporter state. Saved-trip LR list now loads and displays each actual transporter. Existing LRs retain the full Edit LR action rather than being overwritten by a trip save.
4. **Automatic freight:** Weight × Rate works in trip party/transporter controls; saved LR transporter weight/rate controls were missing equivalent automatic filling. Added calculation while retaining manually editable freight. Existing shortage/addition rules and final entered freight posting remain authoritative.
5. **Transporter-only receivable:** prior transporter freight field represented only payable. Added explicit payable/receivable direction, defaulting to historical payable. Receivable posts transporter debit; party freight may be blank. Updated trip/LR profit and settlement labels, without reclassifying historical LRs.
6. **Incoming/outgoing payments:** existing transporter receipt type works. Reports omitted incoming transporter receipts and some account movement sources. Account reports now read the same paginated account_movements source as statements, including transfers and reimbursements.
7. **Trip/LR separation:** trip-only expense, advance and driver-entry arrays stay trip-linked; existing linked LRs are not resubmitted on a trip edit. Explicit new LRs and links still work.
8. **Party-to-driver receipts:** missing entry surface and persisted source. Added driver_transactions, identifying driver, party, amount, date, method, reference and notes. Party credit and driver debit represent funds held by the driver; no company account movement.
9. **Driver Expenses:** added separate entries inside Driver Advance section and on trip/driver details. Expense credits driver liability; selected reimbursement account adds an offsetting driver debit and one company outflow. Unreimbursed expense remains due to driver. Driver costs affect trip profit; advances do not.
10. **Trip expense accounts:** fixed and extra expense form rows lacked individual account choices. Added account, method, reference and paid/pending status. Saved detail editor retains these fields; pending expenses have no account outflow. Stable IDs preserve edit/retry identity.
11. **Regression found during verification:** the pending-expense migration also altered advance SQL, causing “INSERT has more expressions than target columns.” Repaired only the advance section; retested trip save and repeated edits successfully.
12. **Retry safety:** driver entry dialog now saves its list atomically. Repeated cancellation returns the same saved result rather than failing after a successful cancellation.
13. **Display:** DD-MM-YYYY restored through shared date formatting, preserving Asia/Kolkata and INR grouping.

## Changed application files

- src/components/app/DriverTransactions.tsx
- src/components/app/TripForm.tsx
- src/components/app/TripLrSection.tsx
- src/components/app/LRForm.tsx
- src/components/app/MoneyEditors.tsx
- src/components/app/TripProfit.tsx
- src/routes/_authenticated/trips.$id.edit.tsx
- src/routes/_authenticated/trips.$id.index.tsx
- src/routes/_authenticated/lr.$id.index.tsx
- src/routes/_authenticated/driver-ledger.tsx
- src/routes/_authenticated/transporter-settlements.tsx
- src/routes/_authenticated/reports.tsx
- src/lib/driver-transactions.ts and tests
- src/lib/payment-direction.ts and tests
- src/lib/trip-expenses.ts and tests
- src/lib/trip-lrs.ts
- src/lib/trip-summary.ts and tests
- src/lib/lr-summary.ts
- src/lib/transporter-ledger.ts and tests
- src/lib/format.ts and tests
- src/lib/schema-smoke.ts
- Generated database types, AGENTS.md, roadmap.md and project requirements memory.

## Database changes actually applied

- 0028_driver_transactions_and_transporter_direction.sql: additive direction column, driver source records, business RLS/grants, validation/posting/audit triggers, save function, atomic trip integration, cancellation and account movement support.
- 0029_trip_expense_pending_status.sql: persist expense status. Its advance-side regression was corrected below.
- 0030_atomic_driver_entries_and_safe_retries.sql: batch save function and idempotent cancellation retries.
- 0031_repair_trip_advance_save_after_pending_support.sql: remove invalid expense-status references from advance insert/update only, with replacement guards.

The earlier failed migration attempt applied nothing. Successful migrations were not blindly rerun. New functions deny PUBLIC/anon execution and grant authenticated/service_role access. Existing grants, business stamping and source-key ledger upserts remain in place.

## Tests actually performed

**Automated:** 126/126 tests across 24 files passed. Latest harness build/type validation reports build OK; the earlier temporary missing batch-function type error is superseded by successful validation after generated types refreshed.

**Signed-in Chromium against real saved TEST records:**

- Created TEST CLIENT BANK through Add Bank Account with opening ₹10,000; edited to ₹12,000, refreshed and verified persisted opening and retained transactions.
- Saved TEST trips TRP-0013 and TRP-0014. An early verification wait was too short and resulted in a second independent TEST trip; both were tracked and reversed, not mistaken for a same-ID duplicate.
- Two LRs in each trip use different TEST transporters: A ₹2,000, B ₹3,000, with receivable direction and zero party freight. Verified each LR's own transporter debit once, no cross-transporter amount.
- Auto-fill 196.70 × 170 = ₹33,439; manual override to ₹2,000 was saved.
- Direct TEST SWAROOPNAGAR payment ₹15,000 to TEST SANJAY produced driver debit and party credit exactly once per saved TEST receipt, with no company account movement. Real named parties/drivers were not modified.
- Separate ₹500 cash driver advance and ₹200 unreimbursed driver expense. Edited expense to ₹250 and saved trip twice; IDs and record counts remained stable.
- Toll ₹100 bank, CNG ₹50 cash and Food ₹30 pending. Confirmed each paid expense has one selected-account movement and pending Food none. Edited Toll to ₹125; reopening retained account and method.
- Trip reopening loaded both actual LR transporters. Repeated trip saves did not create new LRs or overwrite LR-specific freight.
- ₹700 transporter receipt and ₹80 transporter payment through payment dialog: correct bank in/out direction and transporter credit/debit. Visible bank statement showed both transactions and expense withdrawals.
- Manual party debit ₹100 through UI, then authoritative stable-ID credit edit to ₹125 twice; one original ledger row, edited description visible after reload. Manual edit dialog itself was not exercised.
- Driver expense reimbursement edited in visible driver dialog; exactly one ₹250 bank outflow.
- All 34 schema-smoke sources/column lists returned without errors through authenticated app client, covering favourites, party manual entries and lr_parties.freight_amount. App uses lrs/lr_parties, not a lr_bilties/consignee_party lookup.
- Anonymous driver table read returned zero rows; anonymous driver batch save was denied.
- Driver ledger, party ledger, account statement and account report screenshots inspected. Date display was DD-MM-YYYY.

## Cleanup and history preservation

Cancelled TRP-0013 and TRP-0014 with TEST audit reason; linked TEST LRs, driver transactions, trip expenses and advances cancelled through existing workflow. Reversed both TEST payments and manual entry with reason. Archived TEST driver, parties, transporters and bank. Cleared only the TEST bank opening balance.

Verified aggregate TEST driver, party and transporter ledger effects equal zero and TEST bank has no active account movements. Financial audit/reversal records remain intentionally retained, not hard-deleted. No real master or financial record was edited; only reversible TEST movements temporarily used existing Cash. No real opening balances or owner roles changed.

## Limits and remaining verification

- No database action is required from the user. A restricted diagnostic function could not be called through the read-only query tool; equivalent application schema checks passed without widening grants.
- Staff-role and cross-business denial, concurrent multi-user stress, full export row-count checks and exhaustive auth-provider/settings verification were not performed in this pass.
- Every module was not exercised end to end; evidence above is limited to the requested accounting flows, schema checks and regression suite.
- Saved LR standalone auto-calculation control was updated, but its complete edit/save/reopen flow was not independently retested; trip auto-calculation and saved trip edit flows were tested.
- Existing LRs on trip edits show their transporter and are edited using Edit LR; they do not become inline trip drafts. This preserves unrelated LR data.
- Publish remains pending an explicit user request; these frontend changes are not claimed live.