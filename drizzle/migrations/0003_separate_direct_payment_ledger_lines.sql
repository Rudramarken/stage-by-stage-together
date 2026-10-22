CREATE OR REPLACE FUNCTION public.lr_after() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_bp uuid; v_active boolean := NEW.status <> 'cancelled'; v_dp numeric; v_label text := 'LR ' || NEW.lr_number;
BEGIN
 v_bp := public.lr_billing_party(NEW);
 PERFORM public.ledger_set(NEW.business_id,'party',v_bp,'lrs',NEW.id,'freight',NEW.lr_date,'Freight '||v_label,CASE WHEN v_active THEN NEW.final_freight ELSE 0 END,0);
 v_dp:=CASE WHEN v_active AND NEW.direct_payment_enabled THEN least(NEW.direct_payment_amount,NEW.final_freight) ELSE 0 END;
 PERFORM public.ledger_set(NEW.business_id,'party',v_bp,'lrs',NEW.id,'direct_payment',NEW.lr_date,'Paid driver directly ('||v_label||')',0,v_dp);
 PERFORM public.ledger_set(NEW.business_id,'transporter',NEW.transporter_id,'lrs',NEW.id,'freight_payable',NEW.lr_date,'Freight payable '||v_label,0,CASE WHEN v_active THEN NEW.freight_payable ELSE 0 END);
 PERFORM public.ledger_set(NEW.business_id,'transporter',NEW.transporter_id,'lrs',NEW.id,'direct_payment_transporter',NEW.lr_date,'Consignee paid driver directly ('||v_label||')',CASE WHEN v_active THEN least(v_dp,NEW.freight_payable) ELSE 0 END,0);
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.commission_source_before() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_trip public.trips; v_driver uuid; v_freight numeric; v_receipts numeric;
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
 IF NEW.commission_enabled AND NEW.driver_id IS NULL THEN RAISE EXCEPTION 'Choose or type the driver who owes the commission'; END IF;
 IF TG_TABLE_NAME='trips' THEN
  SELECT coalesce(sum(final_freight),0) INTO v_freight FROM public.lrs WHERE trip_id=NEW.id AND status='active';
  NEW.commission_amount:=CASE WHEN NOT NEW.commission_enabled THEN 0 WHEN NEW.commission_mode='percent' THEN round(v_freight*NEW.commission_value/100,2) ELSE NEW.commission_value END;
 END IF;
 IF TG_TABLE_NAME='lrs' THEN NEW.commission_payer_party_id:=NULL; END IF;
 IF TG_OP='UPDATE' AND OLD.commission_enabled AND NOT NEW.commission_enabled AND coalesce(trim(NEW.commission_cancel_reason),'')='' THEN RAISE EXCEPTION 'Enter a reason for turning commission off'; END IF;
 SELECT coalesce(sum(r.amount),0) INTO v_receipts FROM public.commission_receipts r JOIN public.driver_commissions c ON c.id=r.commission_id WHERE NOT r.is_reversed AND CASE WHEN TG_TABLE_NAME='lrs' THEN c.lr_id=NEW.id ELSE c.trip_id=NEW.id END;
 IF TG_OP='UPDATE' AND v_receipts>0 AND NEW.driver_id IS DISTINCT FROM OLD.driver_id THEN RAISE EXCEPTION 'Reverse commission receipts before changing the driver'; END IF;
 IF NEW.commission_enabled AND NEW.status<>'cancelled' AND NEW.commission_amount<v_receipts THEN RAISE EXCEPTION 'Commission cannot be less than the amount already received'; END IF;
 IF TG_TABLE_NAME='lrs' THEN NEW.commission_status:=CASE WHEN NEW.commission_enabled AND NEW.commission_amount>0 AND v_receipts>=NEW.commission_amount THEN 'received' ELSE 'pending' END; END IF;
 RETURN NEW;
END $$;