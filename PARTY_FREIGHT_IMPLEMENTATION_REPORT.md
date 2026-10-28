# Party-wise freight implementation — 28 October 2026

## Completed
- Trip Section 2 now contains Vehicle & Driver; transporter selection is in Section 3.
- Each consignor, consignee and LR transporter has independent Weight, Rate, Freight, Shortage, Addition and Date.
- Existing vehicle/driver, LR linking, expenses, advances and commission controls remain intact.
- Fields save through the existing atomic LR save. Party row IDs are retained on retries.
- The full LR edit form reloads all new values; legacy LR accounting remains unchanged.

## Accounting interpretation
Existing party-wise freight is explicitly entered and summed for customer freight. Transporter freight remains the explicitly entered final payable. Rate/weight and party shortage/addition details do not invent a rate-unit formula or create additional ledger events. Existing full-LR transporter calculation controls still work when a rate unit is chosen; existing transporter adjustment reasons remain required. Dates are independent details, not changes to historical ledger dates.

## Database
Inspected the live columns, save_lr, lr_before, lr_after, and journal. Journal indices 0–23 were unique and increasing, with 24 applied entries before this change. Older commission migration names repeat content but were not rerun.
- `0024_party_wise_freight_details.sql`: applied; adds nullable party rate/shortage/addition/freight_date and LR transporter_freight_date, extends the existing save function with compatibility-preserving assignments.
- `0025_preserve_manual_transporter_details.sql`: applied; prevents manual transporter weight/rate being discarded when no automatic rate unit is chosen.
- Generated database types refreshed automatically for both changes. Live columns and persisted values verified. No manual SQL steps remain.
- No new tables, no RLS relaxation, no historical backfill, no real financial record deletion.

## Actual checks
- All 99 tests in 18 files passed. Added concrete independent-value and party-ID preservation tests.
- Harness build/type check passed after correcting an intermediate optional-ID typing error.
- Signed-in browser created test trip TRP-0008 and LR TEST-PARTY-FREIGHT-20261028 with three independent sets of values.
- Consignor: weight 101, rate 2, freight 301, shortage 3, addition 4, date 21/10/2026.
- Consignee: weight 202, rate 5, freight 702 edited to 802, shortage 6, addition 7, date 22/10/2026.
- Transporter: weight 303, rate 8, payable 903, shortage 9, addition 10, date 23/10/2026.
- Opened the saved trip edit page, followed Edit LR, checked reload of all fields, saved the freight edit, refreshed and confirmed 802.
- Read-only database check confirmed consignor debit 301, consignee debit 802, one transporter payable credit 903; no duplicate source lines.
- Phone width 390: no horizontal page overflow. No browser page errors during the verified flow.
- Test LR and trip removed using the existing owner-authorized guarded removal function; both returned no error. Existing real records were not changed. Numbering sequences/audit entries intentionally remain.

## Files changed
TripForm.tsx, TripLrSection.tsx, LRForm.tsx, new PartyFreightFields.tsx, trip-lrs.ts/tests, lr-load.ts, schema-smoke.ts, generated database types, two journaled migrations, AGENTS.md, roadmap.md, this report.

## Limitations
No simultaneous-user stress test or new cross-business/Staff-role test was performed in this task. The live website was not republished; frontend changes are in the preview, while database changes are applied to the shared backend.