-- Commission is ALWAYS due from the TRANSPORTER. It must never need a driver and must never sit on the driver ledger.
--
-- FIX: an LR/trip that already had an OLD driver-owed commission (created before 0012) could not be saved
-- ("Choose or type the driver who owes the commission"), so the LR, bilty and ledger lines were not saved.
--
-- What this changes (nothing else):
--   * commission_source_before(): the "Choose or type the driver who owes the commission" error is removed.
--     (If no transporter is chosen, the existing "Choose the transporter who owes the commission" error still applies.)
--   * commission_after(): an old driver-owed commission with NO receipts at all moves to the chosen transporter.
--     Its single 'commission_due' ledger line is updated in place by post_ledger (same source + line kind), so it
--     leaves the driver ledger and shows as "Commission due from transporter" on the transporter ledger.
--     driver_id is cleared so it is never picked up by driver salary recovery. No row is deleted or duplicated.
--   * An old commission that already has receipts stays as it is (keeps its original driver); it is never left without an owner.
--   * All new commissions already go to the transporter (0012) and are unchanged.
--
-- Safe to re-run, and also safe if an earlier draft of 0013 was already applied: each patch is skipped if already
-- applied and aborts (changing nothing) if the expected fragment is not found.

DO $migration$
DECLARE d text; new_frag text; old_frag text; done boolean:=false;
BEGIN
  d := pg_get_functiondef('public.commission_source_before()'::regprocedure);
  IF position('driver no longer required: commission is always due from the transporter' IN d) > 0 THEN RETURN; END IF;
  new_frag := '/* driver no longer required: commission is always due from the transporter */';
  FOREACH old_frag IN ARRAY ARRAY[
    'IF NEW.commission_enabled AND coalesce(v_has,false) AND v_old_t IS NULL AND NEW.driver_id IS NULL THEN RAISE EXCEPTION ''Choose or type the driver who owes the commission''; END IF;',
    'IF NEW.commission_enabled AND coalesce(v_has,false) AND v_old_t IS NULL AND NEW.driver_id IS NULL AND (v_t IS NULL OR EXISTS(SELECT 1 FROM public.commission_receipts r JOIN public.driver_commissions c ON c.id=r.commission_id WHERE CASE WHEN TG_TABLE_NAME=''lrs'' THEN c.lr_id=NEW.id ELSE c.trip_id=NEW.id END)) THEN RAISE EXCEPTION ''Choose or type the driver who owes the commission''; END IF;'
  ] LOOP
    IF position(old_frag IN d) > 0 THEN d := replace(d, old_frag, new_frag); done := true; EXIT; END IF;
  END LOOP;
  IF NOT done THEN RAISE EXCEPTION 'commission_source_before definition not in the expected shape; migration aborted without changes'; END IF;
  EXECUTE d;
END $migration$;

DO $migration$
DECLARE d text; old_frag text; new_frag text; done boolean:=false;
BEGIN
  d := pg_get_functiondef('public.commission_after()'::regprocedure);
  IF position('NOT (v_tr IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.commission_receipts WHERE commission_id=c.id))' IN d) > 0 THEN RETURN; END IF;
  new_frag := 'v_t:=CASE WHEN c.transporter_id IS NULL AND NOT (v_tr IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.commission_receipts WHERE commission_id=c.id)) THEN NULL ELSE coalesce(v_tr,c.transporter_id) END;';
  FOREACH old_frag IN ARRAY ARRAY[
    'v_t:=CASE WHEN c.transporter_id IS NULL THEN NULL ELSE coalesce(v_tr,c.transporter_id) END;',
    'v_t:=CASE WHEN c.transporter_id IS NULL AND NOT (v_tr IS NOT NULL AND NEW.driver_id IS NULL AND NOT EXISTS(SELECT 1 FROM public.commission_receipts WHERE commission_id=c.id)) THEN NULL ELSE coalesce(v_tr,c.transporter_id) END;'
  ] LOOP
    IF position(old_frag IN d) > 0 THEN d := replace(d, old_frag, new_frag); done := true; EXIT; END IF;
  END LOOP;
  IF NOT done THEN RAISE EXCEPTION 'commission_after definition not in the expected shape; migration aborted without changes'; END IF;
  -- an old commission that stays with its driver keeps that driver even if the LR's driver field is empty
  old_frag := 'SET driver_id=CASE WHEN v_t IS NULL THEN NEW.driver_id END,transporter_id=v_t,';
  IF position(old_frag IN d) = 0 THEN RAISE EXCEPTION 'commission_after UPDATE not in the expected shape; migration aborted without changes'; END IF;
  d := replace(d, old_frag, 'SET driver_id=CASE WHEN v_t IS NULL THEN coalesce(NEW.driver_id,c.driver_id) END,transporter_id=v_t,');
  EXECUTE d;
END $migration$;
