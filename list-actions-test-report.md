# List actions — verification report

Checked on 22/10/2026 using the signed-in Owner preview. All writes were confined to clearly named TEST records. No owner memberships were changed.

## Tested and working

- LR Register: actions visible at 1280px laptop width without horizontal scrolling. View and Edit icons remain at the right; the menu includes Print, Cancel and owner-only Delete permanently.
- Mobile: the three-dots menu remains within the right edge at 390px. Long party names wrap; other columns can scroll behind the pinned actions.
- Edited `TEST-ACTIONS-1792674104`: goods description survived save and refresh. Base freight ₹2,000 + ₹100 addition − ₹20 deduction = ₹2,080, not double-applied. There were two party rows, one expense, two adjustments and one commission record.
- Saved `TEST-ACTIONS-1792674104-BLOCK` twice more: all party, expense and adjustment IDs remained identical and final freight stayed ₹1,080.
- Cancelled the TEST LR with a reason: it left Active, appeared under Cancelled and showed Rudra Marken, time and reason. Freight ₹2,080, expense ₹50 and commission ₹100 each retained their original posting and one offsetting reversal. Combined net was ₹0. Repeating cancellation did not add another reversal.
- Permanently deleted `TEST-ACTIONS-1792674104-DELETE`: LR, own expenses and direct LR postings were absent afterwards. The Audit Log showed the LR number, amounts, timestamp and retained actor ID. The audit display includes freight, payable and commission amounts.
- Attempted permanent deletion of the TEST LR with a ₹10 allocated receipt: rejected with the exact TEST receipt reference and advice to use Cancel. The dialog stayed open and showed Retry.
- `LR-0001` was read before and after the central test and was byte-identical. It was not edited, cancelled or deleted. No real record was used for a destructive test.
- TEST salary payment: edited the same payment from ₹100 to ₹80, then reversed with a reason using the dialog. The ₹80 posting and ₹80 reversal netted to ₹0.
- Trips, Parties, Drivers, Vehicles, Routes, Payments and Transporter Settlements loaded with Actions headers. Third-Party Payments had no rows to exercise; it uses the same payment-list actions.
- Twenty automated checks passed, including exact deletion confirmation, required cancellation/reversal reason, freight calculations, commission rules and saved LR child IDs. Current preview compilation reported no errors.

## Built but not tested

- Permanent deletion of unused masters; archive/restore; trip cancellation/deletion; printing through the new row menu; payment and third-party edit/reversal through the new dialogs; settlement edit/reversal from its history.
- Staff denial of permanent deletion, cross-business attempts, concurrent users, network interruption and rapid double-click checks. Owner enforcement and business scoping are implemented server-side; confirmation buttons lock while pending.
- LR editing with a transporter and existing settlement allocations was not exercised in this pass. Allocated payment edits reject amounts below allocations or changes to their links.
- Deletion checks include all current payment types (customer, third-party and transporter) through direct LR/trip links and allocations, plus commission receipt history. No separate settlement or collection table exists in this app.

## Not built / intentional safety restrictions

- Trip permanent deletion is stricter than the requested “no money LRs”: it currently blocks **any linked LR**, as well as expenses, advances or child trips. Remove an eligible linked TEST LR first, or use Cancel.
- Changing already-confirmed salary recovery amounts or moving a salary payment to another driver/month is not an in-place edit: reverse it and record a correction. Cash amount/date/reference/notes are editable without duplicating the payment.
- This is not a full Stage 7 or simultaneous-user security certification.

## Manual checks for the remaining cases

1. Add a new TEST vehicle/route/party. Open Actions → View, Edit, Archive, then Archived → Restore. As Owner, delete an unused TEST master by typing its exact name. A used TEST master must be blocked with Archive advice.
2. Add a TEST trip with two stops and no money or LRs. Edit, refresh and verify its stops. Cancel with a reason and verify audit history. Separately delete an unused TEST trip with typed confirmation.
3. On a TEST party with an outstanding balance, add a third-party receipt. Edit its reference, refresh, then Reverse with a reason; verify the party balance returns. Never permanently delete money.
4. On a TEST transporter, record a payment, select that transporter and use the payment-history Actions → Edit/Reverse. Check the statement updates once.
5. Sign in as Staff: no permanent-delete menu; a direct deletion request must be rejected. In a second business, attempt to read/update a TEST record from the first business; it must be denied.
6. On a new TEST LR only, attempt Cancel while a receipt is active: the message must identify the receipt. Reverse that receipt and retry Cancel. Deletion remains blocked by receipt history even after reversal.
7. Open Print from a TEST LR row. Verify the correct LR is loaded before the print dialog appears.

The retained TEST payment and cancelled TEST records remain clearly marked for review; financial history was not cleaned up by deletion.