# Gokul Cargo Movers TMS — Complete Audit Report (28/10/2026)

## Root cause of the three reported errors
Files 0017–0024 in drizzle/migrations were written for manual running and were never added to the migration journal, so the live database never received them (0016 was journaled but also unapplied). Confirmed by reading the live schema: lr_parties.freight_amount, user_nav_favourites, party_manual_entries, lr_documents, trip_documents, transporter_manual_entries, vehicles.driver_id, transporters.opening_*, payment_accounts.system_key, account_movements, save_payment were all missing.

## Issues found and fixed
| # | Issue | Root cause | Fix | Status |
|---|---|---|---|---|
| A | Favourites "migration 0023 not applied" | table missing live | applied (migration 0021_nav_favourites_party_manual_entries) | Applied + tested in UI |
| B | party_manual_entries missing | table/functions missing live | applied same migration (table, save/reverse entry, set_party_opening) | Applied + tested |
| C | lr_parties.freight_amount missing | column missing live | applied 0017_lr_party_freight_unit_documents (+0016 ran automatically) | Applied + tested |
| D | Trip expenses/advances from trip form not saved | live save_trip was old version | applied 0018 (also vehicles.driver_id, trip documents) | Applied + tested |
| E | **Every trip save failed** ("record new has no field trip_id") | commission rule from earlier commission update referenced an LR-only field on trips | 0022_fix_trip_save_commission_source (one-line fix) | Applied + tested |
| F | Transporter opening balance / manual entries missing | not applied | 0019 | Applied (not UI-tested) |
| G | Cash / Cash Received by Narinder accounts, balances, double-submit-safe payments | not applied | 0020 (written directly with final name) | Applied + tested |
| H | Any staff could add/edit accounts | old "members" policies | Owner/Admin only (in 0020) | Applied |
| I | 33 internal functions callable by signed-out visitors; one function without fixed search path | default grants | 0023_restrict_function_execute_to_signed_in | Applied; sign-in page re-tested |
| J | LR/trip document folders missing | storage buckets never created | created private buckets lr-documents, trip-documents (10 MB) | Tested upload/open/remove; public & signed-out reads blocked |
| K | Build errors (AccountCards bank_name type, document open handlers, TripLrSection hint) | code typos | fixed | Type check clean |
| L | Screens told the owner to "run migration 00xx" | stale text | reworded | Done |

Files changed: src/lib/accounts.ts, src/components/app/{AccountCards,LRDocuments,TripDocuments,TripLrSection,AppShell}.tsx, src/routes/_authenticated/settings.tsx, src/lib/schema-smoke.ts, AGENTS.md, drizzle/migrations/0017–0023 (new), original manual files moved to drizzle/manual-archive/, src/integrations/supabase/types.ts (regenerated).

## Verification performed (live database, signed in)
- All 20 pages opened: no page errors, no failed data requests. Sign-in page works signed out.
- System Check: row security ON for all 30 tables; all 32 tables/columns found.
- Favourites: star Reports → shown at top under Favourites → survives reload → unstar removes it.
- Party ledger (TEST Commission Party): opening 1000 then corrected to 1500 = one row; debit 200, credit 50 saved twice with same id = one entry; negative amount refused; reversal adds offsetting line; running balance on screen matched database. Test effects reversed; balance back to ₹19,130.
- LR party-wise freight: TEST LR saved with consignor ₹300 / consignee ₹700, edited to ₹800 → same ledger line updated, no duplicate. TEST LR and test party then permanently deleted (LR-0019 number used).
- Receipt into Cash Received by Narinder: double submit created one receipt; balance ₹1 then ₹0 after reversal (reversed TEST receipt remains in history).
- Trip: TEST trip TRP-0007 with toll ₹10 + driver advance ₹5; retry returned same trip; advance on driver ledger; trip then cancelled (kept, nets to zero).
- No duplicate ledger lines anywhere (unique source/line rule confirmed).
- Trip form shows no Journey/Direction/Status/Routes & Stops; shows transporter, consignor/consignee, expenses, driver. Account cards are separate. Transporter Settlements / Loads & LR are not in navigation.
- Automated tests 97/97 pass; type check clean.

## Not tested / remaining
- Transporter opening balance and manual entries: applied, not exercised.
- Monthly statement: period picker present and running balances verified for "all history"; a specific month view not separately checked.
- Party/transporter history filters and full-export row counts: page loads without errors; exports not downloaded and counted.
- Staff-role permission checks: not tested (no staff test account).
- Trip LRs created from the trip form were not saved in this run.
- No blockers requiring manual database steps.

## Data preservation
No tables, columns or real records were dropped or changed. Only TEST records were created; they were reversed, cancelled or deleted as noted. The Cash account kept its id and history; "Cash Received by Narinder" was newly created with ₹0.
