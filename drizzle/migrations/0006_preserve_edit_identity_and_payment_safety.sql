DO $migration$
DECLARE d text;
BEGIN
 d:=pg_get_functiondef('public.save_lr(jsonb)'::regprocedure);
 d:=replace(d,'v_keep_e uuid[]:=''{}'';','v_keep_e uuid[]:=''{}''; v_aid uuid; v_keep_a uuid[]:=''{}'';');
 d:=replace(d,' IF v_biz IS NULL THEN RAISE EXCEPTION ''No business found for the signed-in user''; END IF;',' IF v_biz IS NULL THEN RAISE EXCEPTION ''No business found for the signed-in user''; END IF; IF v_id IS NOT NULL THEN PERFORM 1 FROM public.lrs WHERE id=v_id AND business_id=v_biz AND status<>''cancelled'' FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION ''Record not found, cancelled or access denied''; END IF; END IF;');
 d:=replace(d,'IF v_pid IS NULL OR NOT EXISTS(SELECT 1 FROM public.lr_parties WHERE id=v_pid AND lr_id=v_id) THEN','IF v_pid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.lr_parties WHERE id=v_pid AND lr_id=v_id AND business_id=v_biz) THEN RAISE EXCEPTION ''Consignor/consignee does not belong to this LR''; END IF; IF v_pid IS NULL THEN');
 d:=replace(d,'IF v_eid IS NULL OR NOT EXISTS(SELECT 1 FROM public.expenses WHERE id=v_eid AND lr_id=v_id) THEN','IF v_eid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.expenses WHERE id=v_eid AND lr_id=v_id AND business_id=v_biz AND NOT is_cancelled) THEN RAISE EXCEPTION ''Expense not found or already cancelled; refresh the LR''; END IF; IF v_eid IS NULL THEN');
 d:=replace(d,'DELETE FROM public.lr_adjustments WHERE lr_id=v_id;','');
 d:=replace(d,'INSERT INTO public.lr_adjustments(business_id,lr_id,kind,amount,reason) VALUES(v_biz,v_id,r->>''kind'',(r->>''amount'')::numeric,trim(r->>''reason''));','v_aid:=nullif(r->>''id'','''')::uuid; IF v_aid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.lr_adjustments WHERE id=v_aid AND lr_id=v_id AND business_id=v_biz) THEN RAISE EXCEPTION ''Adjustment does not belong to this LR''; END IF; IF v_aid IS NULL THEN INSERT INTO public.lr_adjustments(business_id,lr_id,kind,amount,reason) VALUES(v_biz,v_id,r->>''kind'',(r->>''amount'')::numeric,trim(r->>''reason'')) RETURNING id INTO v_aid; ELSE UPDATE public.lr_adjustments SET kind=r->>''kind'',amount=(r->>''amount'')::numeric,reason=trim(r->>''reason'') WHERE id=v_aid AND lr_id=v_id AND business_id=v_biz; END IF; v_keep_a:=v_keep_a||v_aid;');
 d:=replace(d,'UPDATE public.lrs SET lr_date=','DELETE FROM public.lr_adjustments WHERE lr_id=v_id AND business_id=v_biz AND NOT(id=ANY(v_keep_a)); UPDATE public.lrs SET lr_date=');
 EXECUTE d;
 d:=pg_get_functiondef('public.save_trip(jsonb)'::regprocedure);
 d:=replace(d,' IF v_biz IS NULL THEN RAISE EXCEPTION ''No business found for the signed-in user''; END IF;',' IF v_biz IS NULL THEN RAISE EXCEPTION ''No business found for the signed-in user''; END IF; IF v_id IS NOT NULL THEN PERFORM 1 FROM public.trips WHERE id=v_id AND business_id=v_biz AND status<>''cancelled'' FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION ''Record not found, cancelled or access denied''; END IF; END IF;');
 d:=replace(d,'IF v_sid IS NULL OR NOT EXISTS(SELECT 1 FROM public.trip_stops WHERE id=v_sid AND trip_id=v_id) THEN','IF v_sid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.trip_stops WHERE id=v_sid AND trip_id=v_id AND business_id=v_biz) THEN RAISE EXCEPTION ''Stop does not belong to this trip''; END IF; IF v_sid IS NULL THEN');
 d:=replace(d,'DELETE FROM public.trip_stops WHERE trip_id=v_id AND NOT(id=ANY(v_keep));','IF EXISTS(SELECT 1 FROM public.trip_stops s JOIN public.lrs l ON l.loading_stop_id=s.id OR l.unloading_stop_id=s.id WHERE s.trip_id=v_id AND NOT(s.id=ANY(v_keep))) THEN RAISE EXCEPTION ''A removed stop is linked to an LR; edit that LR first''; END IF; DELETE FROM public.trip_stops WHERE trip_id=v_id AND NOT(id=ANY(v_keep));');
 EXECUTE d;
 d:=pg_get_functiondef('public.salary_payment_before()'::regprocedure);
 d:=replace(d,'(NEW.amount,NEW.recovered_advance,NEW.recovered_commission,NEW.driver_id,NEW.salary_entry_id) IS DISTINCT FROM (OLD.amount,OLD.recovered_advance,OLD.recovered_commission,OLD.driver_id,OLD.salary_entry_id)','(NEW.recovered_advance,NEW.recovered_commission,NEW.driver_id,NEW.salary_entry_id) IS DISTINCT FROM (OLD.recovered_advance,OLD.recovered_commission,OLD.driver_id,OLD.salary_entry_id)');
 d:=replace(d,'IF NEW.recovered_commission>v_com THEN','IF TG_OP=''INSERT'' AND NEW.recovered_commission>v_com THEN');
 EXECUTE d;
END $migration$;
CREATE OR REPLACE FUNCTION public.payment_edit_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE used numeric;
BEGIN
 IF OLD.is_reversed AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'Reversed payments cannot be edited'; END IF;
 IF NOT NEW.is_reversed THEN
  SELECT coalesce(sum(amount),0) INTO used FROM public.payment_allocations WHERE payment_id=NEW.id;
  IF NEW.amount<used THEN RAISE EXCEPTION 'Allocated ₹% exceeds this amount. Reverse this payment and record a correction.',used; END IF;
  IF used>0 AND (NEW.party_id,NEW.transporter_id,NEW.lr_id,NEW.payment_type) IS DISTINCT FROM (OLD.party_id,OLD.transporter_id,OLD.lr_id,OLD.payment_type) THEN RAISE EXCEPTION 'Allocated payment links cannot be changed. Reverse and record a correction.'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ba_payment_edit_guard BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.payment_edit_guard();