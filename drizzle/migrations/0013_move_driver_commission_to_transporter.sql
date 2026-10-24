-- FIX: an LR/trip that already has an OLD driver-owed commission (created before 0012) could not be saved
-- after choosing a transporter and leaving the driver empty. The database refused the whole save with
-- "Choose or type the driver who owes the commission", so the LR, its bilty and its ledger lines were not saved.
--
-- What this changes (nothing else):
--   * commission_source_before(): that driver-required error is now raised only when there is NO transporter
--     to take over the commission, or when receipts already exist for it (receipts must be reversed first, as before).
--   * commission_after(): when an old driver-owed commission has NO receipts at all, the driver is cleared and a
--     transporter is chosen, the commission moves to that transporter. Its single 'commission_due' ledger line is
--     updated in place by post_ledger (same source + line kind), so it leaves the driver ledger and appears as
--     "due from transporter" on the transporter ledger. No row is deleted and nothing is duplicated.
--   * Commissions with receipts, commissions that keep their driver, and all new transporter commissions behave exactly as before.
--
-- Safe to re-run: each patch is skipped if already applied, and aborts (changing nothing) if the expected
-- fragment is not found in the current function.

DO $migration$
DECLARE d text; old_frag text; new_frag text;
BEGIN
  d := pg_get_functiondef('public.commission_source_before()'::regprocedure);
  IF position('v_t IS NULL OR EXISTS(SELECT 1 FROM public.commission_receipts r' IN d) > 0 THEN RETURN; END IF;
  old_frag := 'IF NEW.commission_enabled AND coalesce(v_has,false) AND v_old_t IS NULL AND NEW.driver_id IS NULL THEN RAISE EXCEPTION ''Choose or type the driver who owes the commission''; END IF;';
  new_frag := 'IF NEW.commission_enabled AND coalesce(v_has,false) AND v_old_t IS NULL AND NEW.driver_id IS NULL AND (v_t IS NULL OR EXISTS(SELECT 1 FROM public.commission_receipts r JOIN public.driver_commissions c ON c.id=r.commission_id WHERE CASE WHEN TG_TABLE_NAME=''lrs'' THEN c.lr_id=NEW.id ELSE c.trip_id=NEW.id END)) THEN RAISE EXCEPTION ''Choose or type the driver who owes the commission''; END IF;';
  IF position(old_frag IN d) = 0 THEN RAISE EXCEPTION 'commission_source_before definition not in the expected shape; migration aborted without changes'; END IF;
  d := replace(d, old_frag, new_frag);
  EXECUTE d;
END $migration$;

DO $migration$
DECLARE d text; old_frag text; new_frag text;
BEGIN
  d := pg_get_functiondef('public.commission_after()'::regprocedure);
  IF position('NOT EXISTS(SELECT 1 FROM public.commission_receipts WHERE commission_id=c.id)' IN d) > 0 THEN RETURN; END IF;
  old_frag := 'v_t:=CASE WHEN c.transporter_id IS NULL THEN NULL ELSE coalesce(v_tr,c.transporter_id) END;';
  new_frag := 'v_t:=CASE WHEN c.transporter_id IS NULL AND NOT (v_tr IS NOT NULL AND NEW.driver_id IS NULL AND NOT EXISTS(SELECT 1 FROM public.commission_receipts WHERE commission_id=c.id)) THEN NULL ELSE coalesce(v_tr,c.transporter_id) END;';
  IF position(old_frag IN d) = 0 THEN RAISE EXCEPTION 'commission_after definition not in the expected shape; migration aborted without changes'; END IF;
  d := replace(d, old_frag, new_frag);
  EXECUTE d;
END $migration$;
