-- Commission is now DUE FROM THE TRANSPORTER and is posted to the TRANSPORTER ledger
-- (debit = "Gokul has to receive this amount from the transporter").
--
-- Backward compatible:
--   * Existing commissions (driver_commissions.transporter_id IS NULL) stay due from the driver and keep
--     posting to the driver ledger / salary recovery exactly as before. No existing row is rewritten.
--   * Only commissions created from now on are owed by the transporter. For those, driver_id is left NULL on
--     purpose so they are never picked up by driver salary recovery or driver balances.
--   * No table, column or row is dropped. The only DROP is the read-only view commission_balances, which is
--     re-created immediately below with the identical definition (so it also exposes transporter_id).

ALTER TABLE public.driver_commissions ADD COLUMN IF NOT EXISTS transporter_id uuid REFERENCES public.transporters(id);
ALTER TABLE public.driver_commissions ALTER COLUMN driver_id DROP NOT NULL;
ALTER TABLE public.commission_receipts ADD COLUMN IF NOT EXISTS transporter_id uuid REFERENCES public.transporters(id);
ALTER TABLE public.commission_receipts ALTER COLUMN driver_id DROP NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'driver_commissions_owner_check') THEN
    ALTER TABLE public.driver_commissions ADD CONSTRAINT driver_commissions_owner_check CHECK (driver_id IS NOT NULL OR transporter_id IS NOT NULL);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'commission_receipts_owner_check') THEN
    ALTER TABLE public.commission_receipts ADD CONSTRAINT commission_receipts_owner_check CHECK (driver_id IS NOT NULL OR transporter_id IS NOT NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS driver_commissions_transporter_idx ON public.driver_commissions(business_id, transporter_id) WHERE transporter_id IS NOT NULL;

-- Same view as before (c.* now also carries transporter_id).
DROP VIEW IF EXISTS public.commission_balances;
CREATE VIEW public.commission_balances WITH(security_invoker=true) AS SELECT c.*,coalesce(r.received,0)::numeric AS received_amount,CASE WHEN c.is_cancelled THEN 0 ELSE greatest(0,c.amount-coalesce(r.received,0)) END::numeric AS pending_amount,coalesce(r.cash_received,0)::numeric AS cash_received_amount,coalesce(l.lr_number,t.trip_number) AS document_number FROM public.driver_commissions c LEFT JOIN public.lrs l ON l.id=c.lr_id LEFT JOIN public.trips t ON t.id=c.trip_id LEFT JOIN (SELECT commission_id,sum(amount) AS received,sum(amount) FILTER(WHERE salary_payment_id IS NULL) AS cash_received FROM public.commission_receipts WHERE NOT is_reversed GROUP BY commission_id) r ON r.commission_id=c.id;
GRANT SELECT ON public.commission_balances TO authenticated;
GRANT ALL ON public.commission_balances TO service_role;

-- Same as 0003 version, except: a NEW commission needs a transporter (LR transporter, else its trip's transporter)
-- instead of a driver. An EXISTING driver-owed commission still only needs its driver, as before.
CREATE OR REPLACE FUNCTION public.commission_source_before() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_trip public.trips; v_driver uuid; v_freight numeric; v_receipts numeric; v_has boolean; v_old_t uuid; v_t uuid;
BEGIN
 IF TG_TABLE_NAME='lrs' THEN
  IF NEW.trip_id IS NOT NULL THEN
   SELECT * INTO v_trip FROM public.trips WHERE id=NEW.trip_id AND business_id=NEW.business_id;
   IF v_trip.id IS NULL THEN RAISE EXCEPTION 'Trip not found'; END IF;
   IF coalesce(trim(NEW.driver_name),'')='' AND NEW.driver_id IS NULL THEN NEW.driver_id:=v_trip.driver_id; NEW.driver_name:=v_trip.driver_name; END IF;
  END IF;
 END IF;
 IF coalesce(trim(NEW.driver_name),'')<>'' THEN NEW.driver_id:=public.resolve_driver(NEW.business_id,NEW.driver_name); END IF;
 IF NEW.driver_id IS NOT NULL THEN
  SELECT id INTO v_driver FROM public.drivers WHERE id=NEW.driver_id AND business_id=NEW.business_id FOR UPDATE;
  IF v_driver IS NULL THEN RAISE EXCEPTION 'Driver not found in your business'; END IF;
 END IF;
 v_t:=NEW.transporter_id;
 IF TG_TABLE_NAME='lrs' AND v_t IS NULL AND NEW.trip_id IS NOT NULL THEN v_t:=v_trip.transporter_id; END IF;
 SELECT true, transporter_id INTO v_has, v_old_t FROM public.driver_commissions WHERE CASE WHEN TG_TABLE_NAME='lrs' THEN lr_id=NEW.id ELSE trip_id=NEW.id END;
 IF NEW.commission_enabled AND v_t IS NULL AND NOT (coalesce(v_has,false) AND v_old_t IS NULL AND NEW.driver_id IS NOT NULL) THEN RAISE EXCEPTION 'Choose the transporter who owes the commission'; END IF;
 IF NEW.commission_enabled AND coalesce(v_has,false) AND v_old_t IS NULL AND NEW.driver_id IS NULL THEN RAISE EXCEPTION 'Choose or type the driver who owes the commission'; END IF;
 IF TG_TABLE_NAME='trips' THEN
  SELECT coalesce(sum(final_freight),0) INTO v_freight FROM public.lrs WHERE trip_id=NEW.id AND status='active';
  NEW.commission_amount:=CASE WHEN NOT NEW.commission_enabled THEN 0 WHEN NEW.commission_mode='percent' THEN round(v_freight*NEW.commission_value/100,2) ELSE NEW.commission_value END;
 END IF;
 IF TG_TABLE_NAME='lrs' THEN NEW.commission_payer_party_id:=NULL; END IF;
 IF TG_OP='UPDATE' AND OLD.commission_enabled AND NOT NEW.commission_enabled AND coalesce(trim(NEW.commission_cancel_reason),'')='' THEN RAISE EXCEPTION 'Enter a reason for turning commission off'; END IF;
 SELECT coalesce(sum(r.amount),0) INTO v_receipts FROM public.commission_receipts r JOIN public.driver_commissions c ON c.id=r.commission_id WHERE NOT r.is_reversed AND CASE WHEN TG_TABLE_NAME='lrs' THEN c.lr_id=NEW.id ELSE c.trip_id=NEW.id END;
 IF TG_OP='UPDATE' AND v_receipts>0 AND v_old_t IS NULL AND NEW.driver_id IS DISTINCT FROM OLD.driver_id THEN RAISE EXCEPTION 'Reverse commission receipts before changing the driver'; END IF;
 IF TG_OP='UPDATE' AND v_receipts>0 AND v_old_t IS NOT NULL AND v_t IS NOT NULL AND v_t IS DISTINCT FROM v_old_t THEN RAISE EXCEPTION 'Reverse commission receipts before changing the transporter'; END IF;
 IF NEW.commission_enabled AND NEW.status<>'cancelled' AND NEW.commission_amount<v_receipts THEN RAISE EXCEPTION 'Commission cannot be less than the amount already received'; END IF;
 IF TG_TABLE_NAME='lrs' THEN NEW.commission_status:=CASE WHEN NEW.commission_enabled AND NEW.commission_amount>0 AND v_receipts>=NEW.commission_amount THEN 'received' ELSE 'pending' END; END IF;
 RETURN NEW;
END $$;

-- Same as 0002 version, except: new commissions are stored against the transporter (driver_id NULL) and their
-- ledger lines go to the TRANSPORTER account. Existing driver-owed commissions keep the original driver postings.
CREATE OR REPLACE FUNCTION public.commission_after() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.driver_commissions; v_label text; v_reason text; v_cancel boolean; v_tr uuid; v_t uuid;
BEGIN
 v_cancel:=NOT NEW.commission_enabled OR NEW.status='cancelled'; v_reason:=CASE WHEN NEW.status='cancelled' THEN NEW.cancel_reason ELSE NEW.commission_cancel_reason END;
 IF TG_TABLE_NAME='lrs' THEN SELECT * INTO c FROM public.driver_commissions WHERE lr_id=NEW.id FOR UPDATE; v_label:='LR '||NEW.lr_number; ELSE SELECT * INTO c FROM public.driver_commissions WHERE trip_id=NEW.id FOR UPDATE; v_label:='Trip '||NEW.trip_number; END IF;
 IF c.id IS NULL AND (v_cancel OR NEW.commission_amount=0) THEN RETURN NEW; END IF;
 v_tr:=NEW.transporter_id;
 IF TG_TABLE_NAME='lrs' AND v_tr IS NULL AND NEW.trip_id IS NOT NULL THEN SELECT transporter_id INTO v_tr FROM public.trips WHERE id=NEW.trip_id AND business_id=NEW.business_id; END IF;
 IF c.id IS NULL THEN
  v_t:=v_tr;
  INSERT INTO public.driver_commissions(business_id,driver_id,transporter_id,lr_id,trip_id,amount,commission_date,reference,notes) VALUES(NEW.business_id,CASE WHEN v_t IS NULL THEN NEW.driver_id END,v_t,CASE WHEN TG_TABLE_NAME='lrs' THEN NEW.id END,CASE WHEN TG_TABLE_NAME='trips' THEN NEW.id END,NEW.commission_amount,coalesce(NEW.commission_date,current_date),NEW.commission_reference,NEW.commission_notes) RETURNING * INTO c;
 ELSE
  v_t:=CASE WHEN c.transporter_id IS NULL THEN NULL ELSE coalesce(v_tr,c.transporter_id) END;
  UPDATE public.driver_commissions SET driver_id=CASE WHEN v_t IS NULL THEN NEW.driver_id END,transporter_id=v_t,amount=CASE WHEN v_cancel THEN amount ELSE NEW.commission_amount END, commission_date=coalesce(NEW.commission_date,commission_date),reference=NEW.commission_reference,notes=NEW.commission_notes,is_cancelled=v_cancel,cancel_reason=CASE WHEN v_cancel THEN v_reason END WHERE id=c.id RETURNING * INTO c;
 END IF;
 IF c.transporter_id IS NOT NULL THEN
  PERFORM public.post_ledger(c.business_id,'transporter',c.transporter_id,'driver_commissions',c.id,'commission_due',c.commission_date,'Commission due from transporter ('||v_label||')',c.amount,0);
  PERFORM public.ledger_set(c.business_id,'transporter',c.transporter_id,'driver_commissions',c.id,'commission_cancelled',current_date,'Commission reversed ('||v_label||'): '||coalesce(v_reason,'Reactivated'),0,CASE WHEN v_cancel THEN c.amount ELSE 0 END);
 ELSE
  PERFORM public.post_ledger(c.business_id,'driver',c.driver_id,'driver_commissions',c.id,'commission_due',c.commission_date,'Commission due from driver ('||v_label||')',c.amount,0);
  PERFORM public.ledger_set(c.business_id,'driver',c.driver_id,'driver_commissions',c.id,'commission_cancelled',current_date,'Commission reversed ('||v_label||'): '||coalesce(v_reason,'Reactivated'),0,CASE WHEN v_cancel THEN c.amount ELSE 0 END);
 END IF;
 IF TG_TABLE_NAME='lrs' THEN UPDATE public.trips SET commission_value=commission_value WHERE id=NEW.trip_id AND commission_enabled AND commission_mode='percent'; END IF;
 RETURN NEW;
END $$;

-- Same as 0002 version, except receipts for transporter-owed commissions post to the TRANSPORTER ledger (credit).
CREATE OR REPLACE FUNCTION public.commission_receipt_after() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.driver_commissions; v_label text;
BEGIN
 SELECT * INTO c FROM public.driver_commissions WHERE id=NEW.commission_id;
 SELECT coalesce(l.lr_number,t.trip_number) INTO v_label FROM public.driver_commissions x LEFT JOIN public.lrs l ON l.id=x.lr_id LEFT JOIN public.trips t ON t.id=x.trip_id WHERE x.id=c.id;
 IF c.transporter_id IS NOT NULL THEN
  PERFORM public.post_ledger(NEW.business_id,'transporter',c.transporter_id,'commission_receipts',NEW.id,'commission_received',NEW.receipt_date,'Commission received from transporter ('||v_label||')',0,NEW.amount);
  PERFORM public.ledger_set(NEW.business_id,'transporter',c.transporter_id,'commission_receipts',NEW.id,'commission_receipt_reversed',NEW.receipt_date,'Commission receipt reversed: '||coalesce(NEW.reversal_reason,''),CASE WHEN NEW.is_reversed THEN NEW.amount ELSE 0 END,0);
 ELSE
  PERFORM public.post_ledger(NEW.business_id,'driver',NEW.driver_id,'commission_receipts',NEW.id,'commission_received',NEW.receipt_date,CASE WHEN NEW.salary_payment_id IS NULL THEN 'Commission received (' ELSE 'Commission recovered from salary (' END||v_label||')',0,NEW.amount);
  PERFORM public.ledger_set(NEW.business_id,'driver',NEW.driver_id,'commission_receipts',NEW.id,'commission_receipt_reversed',NEW.receipt_date,'Commission receipt reversed: '||coalesce(NEW.reversal_reason,''),CASE WHEN NEW.is_reversed THEN NEW.amount ELSE 0 END,0);
 END IF;
 RETURN NEW;
END $$;

-- Same as 0002 version, except the receipt is stored against the commission's owner (driver or transporter)
-- and the transporter row is locked too.
CREATE OR REPLACE FUNCTION public.record_commission_receipt(p jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.driver_commissions; v_id uuid; v_amount numeric:=round((p->>'amount')::numeric,2); v_pending numeric; v_request uuid:=(p->>'request_id')::uuid;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
 SELECT * INTO c FROM public.driver_commissions WHERE id=(p->>'commission_id')::uuid AND public.is_business_member(business_id);
 IF c.id IS NULL THEN RAISE EXCEPTION 'Commission not found'; END IF;
 PERFORM 1 FROM public.drivers WHERE id=c.driver_id FOR UPDATE;
 PERFORM 1 FROM public.transporters WHERE id=c.transporter_id FOR UPDATE;
 SELECT id INTO v_id FROM public.commission_receipts WHERE request_id=v_request AND business_id=c.business_id;
 IF v_id IS NOT NULL THEN RETURN v_id; END IF;
 SELECT * INTO c FROM public.driver_commissions WHERE id=c.id FOR UPDATE;
 SELECT c.amount-coalesce(sum(amount),0) INTO v_pending FROM public.commission_receipts WHERE commission_id=c.id AND NOT is_reversed;
 IF c.is_cancelled THEN RAISE EXCEPTION 'Commission is cancelled'; END IF;
 IF v_amount IS NULL OR v_amount<=0 OR v_amount>v_pending THEN RAISE EXCEPTION 'Receipt must be greater than zero and cannot exceed pending commission'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.payment_accounts WHERE id=(p->>'account_id')::uuid AND business_id=c.business_id AND is_active) THEN RAISE EXCEPTION 'Choose Cash or an active bank account'; END IF;
 INSERT INTO public.commission_receipts(business_id,commission_id,driver_id,transporter_id,amount,receipt_date,account_id,request_id,reference,notes) VALUES(c.business_id,c.id,c.driver_id,c.transporter_id,v_amount,coalesce(nullif(p->>'receipt_date','')::date,current_date),(p->>'account_id')::uuid,v_request,p->>'reference',p->>'notes') RETURNING id INTO v_id;
 RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.record_commission_receipt(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_commission_receipt(jsonb) TO authenticated;

-- Same as 0002 version, plus the transporter row lock.
CREATE OR REPLACE FUNCTION public.reverse_commission_receipt(p_id uuid,p_reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.commission_receipts;
BEGIN
 SELECT * INTO r FROM public.commission_receipts WHERE id=p_id AND public.is_business_member(business_id);
 IF auth.uid() IS NULL OR r.id IS NULL THEN RAISE EXCEPTION 'Receipt not found'; END IF;
 IF coalesce(trim(p_reason),'')='' THEN RAISE EXCEPTION 'Reason required'; END IF;
 IF r.salary_payment_id IS NOT NULL THEN RAISE EXCEPTION 'Reverse the salary payment instead'; END IF;
 PERFORM 1 FROM public.drivers WHERE id=r.driver_id FOR UPDATE;
 PERFORM 1 FROM public.transporters WHERE id=r.transporter_id FOR UPDATE;
 UPDATE public.commission_receipts SET is_reversed=true,reversal_reason=trim(p_reason) WHERE id=p_id AND NOT is_reversed;
END $$;
REVOKE ALL ON FUNCTION public.reverse_commission_receipt(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.reverse_commission_receipt(uuid,text) TO authenticated;
