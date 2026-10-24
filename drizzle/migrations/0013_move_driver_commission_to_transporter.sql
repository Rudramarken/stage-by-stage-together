-- Commission is ALWAYS due from the TRANSPORTER. It must never need a driver and must never sit on the driver ledger.
-- The driver hands the money to the transporter; the commission is collected from the transporter, so it is
-- tracked ONLY on the transporter ledger.
--
-- What this changes (nothing else):
--   1. commission_source_before(): the "Choose or type the driver who owes the commission" error is removed.
--      (No transporter chosen -> the existing "Choose the transporter who owes the commission" error still applies.)
--      Clearing/changing the driver is no longer blocked by old cash receipts (they move with the commission).
--   2. commission_after(): any old driver-owed commission (and its cash receipts) moves to the LR's/trip's transporter
--      when the LR/trip is saved. Its ledger lines are updated in place (same source + line kind) so they leave the
--      driver ledger and show on the transporter ledger. driver_id is cleared, so it never appears in driver
--      balances or salary recovery.
--   3. One-time move of EXISTING driver-owed commissions: each one whose LR (or its trip / the trip itself) has a
--      transporter is moved to that transporter, together with its receipts and ledger lines. Nothing is deleted
--      and no amount changes. Commissions that were recovered from a driver's SALARY, or that have no transporter
--      on their LR/trip, are left exactly as they were (a notice lists how many were moved/skipped).
--
-- Safe to re-run, and safe if an earlier draft of 0013 was already applied: each patch is skipped if already applied
-- and aborts (changing nothing) if the expected fragment is not found.

-- 1) before-trigger
DO $migration$
DECLARE d text; old_frag text; new_frag text; done boolean:=false;
BEGIN
  d := pg_get_functiondef('public.commission_source_before()'::regprocedure);
  IF position('driver no longer required: commission is always due from the transporter' IN d) = 0 THEN
    new_frag := '/* driver no longer required: commission is always due from the transporter */';
    FOREACH old_frag IN ARRAY ARRAY[
      'IF NEW.commission_enabled AND coalesce(v_has,false) AND v_old_t IS NULL AND NEW.driver_id IS NULL THEN RAISE EXCEPTION ''Choose or type the driver who owes the commission''; END IF;',
      'IF NEW.commission_enabled AND coalesce(v_has,false) AND v_old_t IS NULL AND NEW.driver_id IS NULL AND (v_t IS NULL OR EXISTS(SELECT 1 FROM public.commission_receipts r JOIN public.driver_commissions c ON c.id=r.commission_id WHERE CASE WHEN TG_TABLE_NAME=''lrs'' THEN c.lr_id=NEW.id ELSE c.trip_id=NEW.id END)) THEN RAISE EXCEPTION ''Choose or type the driver who owes the commission''; END IF;'
    ] LOOP
      IF position(old_frag IN d) > 0 THEN d := replace(d, old_frag, new_frag); done := true; EXIT; END IF;
    END LOOP;
    IF NOT done THEN RAISE EXCEPTION 'commission_source_before definition not in the expected shape; migration aborted without changes'; END IF;
  END IF;
  IF position('r.salary_payment_id IS NOT NULL AND CASE' IN d) = 0 THEN
    old_frag := 'IF TG_OP=''UPDATE'' AND v_receipts>0 AND v_old_t IS NULL AND NEW.driver_id IS DISTINCT FROM OLD.driver_id THEN RAISE EXCEPTION ''Reverse commission receipts before changing the driver''; END IF;';
    IF position(old_frag IN d) = 0 THEN RAISE EXCEPTION 'commission_source_before receipt check not in the expected shape; migration aborted without changes'; END IF;
    new_frag := 'IF TG_OP=''UPDATE'' AND v_receipts>0 AND v_old_t IS NULL AND NEW.driver_id IS DISTINCT FROM OLD.driver_id AND (v_t IS NULL OR EXISTS(SELECT 1 FROM public.commission_receipts r JOIN public.driver_commissions c ON c.id=r.commission_id WHERE r.salary_payment_id IS NOT NULL AND CASE WHEN TG_TABLE_NAME=''lrs'' THEN c.lr_id=NEW.id ELSE c.trip_id=NEW.id END)) THEN RAISE EXCEPTION ''Reverse commission receipts before changing the driver''; END IF;';
    d := replace(d, old_frag, new_frag);
  END IF;
  EXECUTE d;
END $migration$;

-- 2) after-trigger
DO $migration$
DECLARE d text; old_frag text; new_frag text; done boolean:=false;
BEGIN
  d := pg_get_functiondef('public.commission_after()'::regprocedure);
  -- (a) an old driver-owed commission moves to the transporter unless it was recovered from driver salary
  IF position('salary_payment_id IS NOT NULL)) THEN NULL ELSE coalesce(v_tr' IN d) = 0 THEN
    new_frag := 'v_t:=CASE WHEN c.transporter_id IS NULL AND NOT (v_tr IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.commission_receipts WHERE commission_id=c.id AND salary_payment_id IS NOT NULL)) THEN NULL ELSE coalesce(v_tr,c.transporter_id) END;';
    FOREACH old_frag IN ARRAY ARRAY[
      'v_t:=CASE WHEN c.transporter_id IS NULL THEN NULL ELSE coalesce(v_tr,c.transporter_id) END;',
      'v_t:=CASE WHEN c.transporter_id IS NULL AND NOT (v_tr IS NOT NULL AND NEW.driver_id IS NULL AND NOT EXISTS(SELECT 1 FROM public.commission_receipts WHERE commission_id=c.id)) THEN NULL ELSE coalesce(v_tr,c.transporter_id) END;',
      'v_t:=CASE WHEN c.transporter_id IS NULL AND NOT (v_tr IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.commission_receipts WHERE commission_id=c.id)) THEN NULL ELSE coalesce(v_tr,c.transporter_id) END;'
    ] LOOP
      IF position(old_frag IN d) > 0 THEN d := replace(d, old_frag, new_frag); done := true; EXIT; END IF;
    END LOOP;
    IF NOT done THEN RAISE EXCEPTION 'commission_after definition not in the expected shape; migration aborted without changes'; END IF;
  END IF;
  -- (b) a commission that stays with its old driver keeps that driver even if the LR's driver field is empty
  IF position('coalesce(NEW.driver_id,c.driver_id)' IN d) = 0 THEN
    old_frag := 'SET driver_id=CASE WHEN v_t IS NULL THEN NEW.driver_id END,transporter_id=v_t,';
    IF position(old_frag IN d) = 0 THEN RAISE EXCEPTION 'commission_after UPDATE not in the expected shape; migration aborted without changes'; END IF;
    d := replace(d, old_frag, 'SET driver_id=CASE WHEN v_t IS NULL THEN coalesce(NEW.driver_id,c.driver_id) END,transporter_id=v_t,');
  END IF;
  -- (c) when a commission is owned by a transporter, its receipts follow it (and their ledger lines move to the transporter)
  IF position('SET driver_id=NULL,transporter_id=c.transporter_id WHERE commission_id=c.id' IN d) = 0 THEN
    old_frag := 'PERFORM public.post_ledger(c.business_id,''transporter'',c.transporter_id,''driver_commissions'',c.id,''commission_due'',';
    IF position(old_frag IN d) = 0 THEN RAISE EXCEPTION 'commission_after ledger posting not in the expected shape; migration aborted without changes'; END IF;
    d := replace(d, old_frag, 'UPDATE public.commission_receipts SET driver_id=NULL,transporter_id=c.transporter_id WHERE commission_id=c.id AND driver_id IS NOT NULL; ' || old_frag);
  END IF;
  EXECUTE d;
END $migration$;

-- 3) one-time move of existing driver-owed commissions to their transporter
DO $backfill$
DECLARE c record; v_t uuid; moved int:=0; skipped int:=0;
BEGIN
  FOR c IN SELECT * FROM public.driver_commissions WHERE transporter_id IS NULL ORDER BY id FOR UPDATE LOOP
    SELECT coalesce(l.transporter_id, tl.transporter_id, tt.transporter_id) INTO v_t
      FROM public.driver_commissions x
      LEFT JOIN public.lrs l ON l.id=x.lr_id
      LEFT JOIN public.trips tl ON tl.id=l.trip_id
      LEFT JOIN public.trips tt ON tt.id=x.trip_id
     WHERE x.id=c.id;
    IF v_t IS NULL OR EXISTS(SELECT 1 FROM public.commission_receipts WHERE commission_id=c.id AND salary_payment_id IS NOT NULL) THEN
      skipped := skipped + 1;
    ELSE
      UPDATE public.driver_commissions SET driver_id=NULL, transporter_id=v_t WHERE id=c.id;
      UPDATE public.commission_receipts SET driver_id=NULL, transporter_id=v_t WHERE commission_id=c.id;
      UPDATE public.ledger_entries SET account_type='transporter', account_id=v_t,
             description=replace(description,'Commission due from driver','Commission due from transporter')
       WHERE source_table='driver_commissions' AND source_id=c.id AND account_type='driver';
      UPDATE public.ledger_entries SET account_type='transporter', account_id=v_t,
             description=replace(replace(description,'Commission received (','Commission received from transporter ('),'Commission recovered from salary (','Commission received from transporter (')
       WHERE source_table='commission_receipts' AND account_type='driver'
         AND source_id IN (SELECT id FROM public.commission_receipts WHERE commission_id=c.id);
      moved := moved + 1;
    END IF;
  END LOOP;
  RAISE NOTICE 'Commissions moved to transporter ledger: %, left unchanged (no transporter on LR/trip, or recovered from salary): %', moved, skipped;
END $backfill$;
