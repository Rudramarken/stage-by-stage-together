ALTER TABLE public.lrs ADD COLUMN driver_id uuid REFERENCES public.drivers(id);
ALTER TABLE public.lrs ADD COLUMN commission_cancel_reason text;
COMMENT ON COLUMN public.lrs.commission_payer_party_id IS 'DEPRECATED: commission is owed by driver_id, not a party';
ALTER TABLE public.salary_payments ADD COLUMN recovered_commission numeric(14,2) NOT NULL DEFAULT 0 CHECK (recovered_commission >= 0);
ALTER TABLE public.trips ADD COLUMN commission_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.trips ADD COLUMN commission_mode text NOT NULL DEFAULT 'fixed' CHECK (commission_mode IN ('fixed','percent'));
ALTER TABLE public.trips ADD COLUMN commission_value numeric(14,2) NOT NULL DEFAULT 0 CHECK (commission_value >= 0);
ALTER TABLE public.trips ADD COLUMN commission_amount numeric(14,2) NOT NULL DEFAULT 0;
ALTER TABLE public.trips ADD COLUMN commission_date date;
ALTER TABLE public.trips ADD COLUMN commission_reference text;
ALTER TABLE public.trips ADD COLUMN commission_notes text;
ALTER TABLE public.trips ADD COLUMN commission_cancel_reason text;
CREATE TABLE public.driver_commissions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), business_id uuid NOT NULL REFERENCES public.businesses(id), driver_id uuid NOT NULL REFERENCES public.drivers(id), lr_id uuid UNIQUE REFERENCES public.lrs(id), trip_id uuid UNIQUE REFERENCES public.trips(id), amount numeric(14,2) NOT NULL CHECK(amount >= 0), commission_date date NOT NULL DEFAULT current_date, reference text, notes text, is_cancelled boolean NOT NULL DEFAULT false, cancel_reason text, created_by uuid, created_at timestamptz NOT NULL DEFAULT now(), CHECK ((lr_id IS NOT NULL)::int + (trip_id IS NOT NULL)::int = 1));
GRANT SELECT ON public.driver_commissions TO authenticated;
GRANT ALL ON public.driver_commissions TO service_role;
ALTER TABLE public.driver_commissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read commissions" ON public.driver_commissions FOR SELECT TO authenticated USING(public.is_business_member(business_id));
CREATE TABLE public.commission_receipts (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), business_id uuid NOT NULL REFERENCES public.businesses(id), commission_id uuid NOT NULL REFERENCES public.driver_commissions(id), driver_id uuid NOT NULL REFERENCES public.drivers(id), amount numeric(14,2) NOT NULL CHECK(amount > 0), receipt_date date NOT NULL DEFAULT current_date, account_id uuid REFERENCES public.payment_accounts(id), salary_payment_id uuid REFERENCES public.salary_payments(id), request_id uuid NOT NULL UNIQUE, reference text, notes text, is_reversed boolean NOT NULL DEFAULT false, reversal_reason text, created_by uuid, created_at timestamptz NOT NULL DEFAULT now(), CHECK(account_id IS NOT NULL OR salary_payment_id IS NOT NULL), UNIQUE(salary_payment_id,commission_id));
GRANT SELECT ON public.commission_receipts TO authenticated;
GRANT ALL ON public.commission_receipts TO service_role;
ALTER TABLE public.commission_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read commission receipts" ON public.commission_receipts FOR SELECT TO authenticated USING(public.is_business_member(business_id));
CREATE TRIGGER a_stamp_business BEFORE INSERT OR UPDATE ON public.driver_commissions FOR EACH ROW EXECUTE FUNCTION public.stamp_business_id();
CREATE TRIGGER a_stamp_business BEFORE INSERT OR UPDATE ON public.commission_receipts FOR EACH ROW EXECUTE FUNCTION public.stamp_business_id();
CREATE OR REPLACE FUNCTION public.resolve_driver(p_business uuid, p_name text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id uuid; v_norm text := lower(regexp_replace(trim(p_name),'\s+',' ','g'));
BEGIN
 IF coalesce(v_norm,'')='' THEN RETURN NULL; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_business::text || v_norm,0));
 SELECT id INTO v_id FROM public.drivers WHERE business_id=p_business AND lower(regexp_replace(trim(name),'\s+',' ','g'))=v_norm ORDER BY created_at,id LIMIT 1;
 IF v_id IS NULL THEN INSERT INTO public.drivers(business_id,name) VALUES(p_business,regexp_replace(trim(p_name),'\s+',' ','g')) RETURNING id INTO v_id; END IF;
 RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.resolve_driver(uuid,text) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.commission_source_before() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_trip public.trips; v_driver uuid; v_freight numeric; v_receipts numeric;
BEGIN
 IF TG_TABLE_NAME='lrs' AND NEW.trip_id IS NOT NULL THEN
  SELECT * INTO v_trip FROM public.trips WHERE id=NEW.trip_id AND business_id=NEW.business_id;
  IF v_trip.id IS NULL THEN RAISE EXCEPTION 'Trip not found'; END IF;
  IF coalesce(trim(NEW.driver_name),'')='' THEN NEW.driver_id:=v_trip.driver_id; NEW.driver_name:=v_trip.driver_name; END IF;
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
CREATE TRIGGER bz_commission_source BEFORE INSERT OR UPDATE ON public.lrs FOR EACH ROW EXECUTE FUNCTION public.commission_source_before();
CREATE TRIGGER bz_commission_source BEFORE INSERT OR UPDATE ON public.trips FOR EACH ROW EXECUTE FUNCTION public.commission_source_before();
CREATE OR REPLACE FUNCTION public.commission_after() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.driver_commissions; v_label text; v_reason text; v_cancel boolean;
BEGIN
 v_cancel:=NOT NEW.commission_enabled OR NEW.status='cancelled'; v_reason:=CASE WHEN NEW.status='cancelled' THEN NEW.cancel_reason ELSE NEW.commission_cancel_reason END;
 IF TG_TABLE_NAME='lrs' THEN SELECT * INTO c FROM public.driver_commissions WHERE lr_id=NEW.id FOR UPDATE; v_label:='LR '||NEW.lr_number; ELSE SELECT * INTO c FROM public.driver_commissions WHERE trip_id=NEW.id FOR UPDATE; v_label:='Trip '||NEW.trip_number; END IF;
 IF c.id IS NULL AND (v_cancel OR NEW.commission_amount=0) THEN RETURN NEW; END IF;
 IF c.id IS NULL THEN
  INSERT INTO public.driver_commissions(business_id,driver_id,lr_id,trip_id,amount,commission_date,reference,notes) VALUES(NEW.business_id,NEW.driver_id,CASE WHEN TG_TABLE_NAME='lrs' THEN NEW.id END,CASE WHEN TG_TABLE_NAME='trips' THEN NEW.id END,NEW.commission_amount,coalesce(NEW.commission_date,current_date),NEW.commission_reference,NEW.commission_notes) RETURNING * INTO c;
 ELSE
  UPDATE public.driver_commissions SET driver_id=NEW.driver_id,amount=CASE WHEN v_cancel THEN amount ELSE NEW.commission_amount END, commission_date=coalesce(NEW.commission_date,commission_date),reference=NEW.commission_reference,notes=NEW.commission_notes,is_cancelled=v_cancel,cancel_reason=CASE WHEN v_cancel THEN v_reason END WHERE id=c.id RETURNING * INTO c;
 END IF;
 PERFORM public.post_ledger(c.business_id,'driver',c.driver_id,'driver_commissions',c.id,'commission_due',c.commission_date,'Commission due from driver ('||v_label||')',c.amount,0);
 PERFORM public.ledger_set(c.business_id,'driver',c.driver_id,'driver_commissions',c.id,'commission_cancelled',current_date,'Commission reversed ('||v_label||'): '||coalesce(v_reason,'Reactivated'),0,CASE WHEN v_cancel THEN c.amount ELSE 0 END);
 IF TG_TABLE_NAME='lrs' THEN UPDATE public.trips SET commission_value=commission_value WHERE id=NEW.trip_id AND commission_enabled AND commission_mode='percent'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER cz_commission_after AFTER INSERT OR UPDATE ON public.lrs FOR EACH ROW EXECUTE FUNCTION public.commission_after();
CREATE TRIGGER cz_commission_after AFTER INSERT OR UPDATE ON public.trips FOR EACH ROW EXECUTE FUNCTION public.commission_after();
CREATE VIEW public.commission_balances WITH(security_invoker=true) AS SELECT c.*,coalesce(r.received,0)::numeric AS received_amount,CASE WHEN c.is_cancelled THEN 0 ELSE greatest(0,c.amount-coalesce(r.received,0)) END::numeric AS pending_amount,coalesce(r.cash_received,0)::numeric AS cash_received_amount,coalesce(l.lr_number,t.trip_number) AS document_number FROM public.driver_commissions c LEFT JOIN public.lrs l ON l.id=c.lr_id LEFT JOIN public.trips t ON t.id=c.trip_id LEFT JOIN (SELECT commission_id,sum(amount) AS received,sum(amount) FILTER(WHERE salary_payment_id IS NULL) AS cash_received FROM public.commission_receipts WHERE NOT is_reversed GROUP BY commission_id) r ON r.commission_id=c.id;
GRANT SELECT ON public.commission_balances TO authenticated;
GRANT ALL ON public.commission_balances TO service_role;
CREATE OR REPLACE FUNCTION public.commission_receipt_after() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.driver_commissions; v_label text;
BEGIN
 SELECT * INTO c FROM public.driver_commissions WHERE id=NEW.commission_id;
 SELECT coalesce(l.lr_number,t.trip_number) INTO v_label FROM public.driver_commissions x LEFT JOIN public.lrs l ON l.id=x.lr_id LEFT JOIN public.trips t ON t.id=x.trip_id WHERE x.id=c.id;
 PERFORM public.post_ledger(NEW.business_id,'driver',NEW.driver_id,'commission_receipts',NEW.id,'commission_received',NEW.receipt_date,CASE WHEN NEW.salary_payment_id IS NULL THEN 'Commission received (' ELSE 'Commission recovered from salary (' END||v_label||')',0,NEW.amount);
 PERFORM public.ledger_set(NEW.business_id,'driver',NEW.driver_id,'commission_receipts',NEW.id,'commission_receipt_reversed',NEW.receipt_date,'Commission receipt reversed: '||coalesce(NEW.reversal_reason,''),CASE WHEN NEW.is_reversed THEN NEW.amount ELSE 0 END,0);
 RETURN NEW;
END $$;
CREATE TRIGGER c_receipt_after AFTER INSERT OR UPDATE ON public.commission_receipts FOR EACH ROW EXECUTE FUNCTION public.commission_receipt_after();
CREATE OR REPLACE FUNCTION public.record_commission_receipt(p jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.driver_commissions; v_id uuid; v_amount numeric:=round((p->>'amount')::numeric,2); v_pending numeric; v_request uuid:=(p->>'request_id')::uuid;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
 SELECT * INTO c FROM public.driver_commissions WHERE id=(p->>'commission_id')::uuid AND public.is_business_member(business_id);
 IF c.id IS NULL THEN RAISE EXCEPTION 'Commission not found'; END IF;
 PERFORM 1 FROM public.drivers WHERE id=c.driver_id FOR UPDATE;
 SELECT id INTO v_id FROM public.commission_receipts WHERE request_id=v_request AND business_id=c.business_id;
 IF v_id IS NOT NULL THEN RETURN v_id; END IF;
 SELECT * INTO c FROM public.driver_commissions WHERE id=c.id FOR UPDATE;
 SELECT c.amount-coalesce(sum(amount),0) INTO v_pending FROM public.commission_receipts WHERE commission_id=c.id AND NOT is_reversed;
 IF c.is_cancelled THEN RAISE EXCEPTION 'Commission is cancelled'; END IF;
 IF v_amount IS NULL OR v_amount<=0 OR v_amount>v_pending THEN RAISE EXCEPTION 'Receipt must be greater than zero and cannot exceed pending commission'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.payment_accounts WHERE id=(p->>'account_id')::uuid AND business_id=c.business_id AND is_active) THEN RAISE EXCEPTION 'Choose Cash or an active bank account'; END IF;
 INSERT INTO public.commission_receipts(business_id,commission_id,driver_id,amount,receipt_date,account_id,request_id,reference,notes) VALUES(c.business_id,c.id,c.driver_id,v_amount,coalesce(nullif(p->>'receipt_date','')::date,current_date),(p->>'account_id')::uuid,v_request,p->>'reference',p->>'notes') RETURNING id INTO v_id;
 RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.record_commission_receipt(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_commission_receipt(jsonb) TO authenticated;
CREATE OR REPLACE FUNCTION public.reverse_commission_receipt(p_id uuid,p_reason text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.commission_receipts;
BEGIN
 SELECT * INTO r FROM public.commission_receipts WHERE id=p_id AND public.is_business_member(business_id);
 IF auth.uid() IS NULL OR r.id IS NULL THEN RAISE EXCEPTION 'Receipt not found'; END IF;
 IF coalesce(trim(p_reason),'')='' THEN RAISE EXCEPTION 'Reason required'; END IF;
 IF r.salary_payment_id IS NOT NULL THEN RAISE EXCEPTION 'Reverse the salary payment instead'; END IF;
 PERFORM 1 FROM public.drivers WHERE id=r.driver_id FOR UPDATE;
 UPDATE public.commission_receipts SET is_reversed=true,reversal_reason=trim(p_reason) WHERE id=p_id AND NOT is_reversed;
END $$;
REVOKE ALL ON FUNCTION public.reverse_commission_receipt(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.reverse_commission_receipt(uuid,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.lr_after() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_bp uuid; v_active boolean := NEW.status <> 'cancelled'; v_dp numeric; v_label text := 'LR ' || NEW.lr_number;
BEGIN
 v_bp := public.lr_billing_party(NEW);
 PERFORM public.ledger_set(NEW.business_id,'party',v_bp,'lrs',NEW.id,'freight',NEW.lr_date,'Freight '||v_label,CASE WHEN v_active THEN NEW.final_freight ELSE 0 END,0);
 v_dp:=CASE WHEN v_active AND NEW.direct_payment_enabled THEN least(NEW.direct_payment_amount,NEW.final_freight) ELSE 0 END;
 PERFORM public.ledger_set(NEW.business_id,'party',v_bp,'lrs',NEW.id,'direct_payment',NEW.lr_date,'Paid driver directly ('||v_label||')',0,v_dp);
 PERFORM public.ledger_set(NEW.business_id,'transporter',NEW.transporter_id,'lrs',NEW.id,'freight_payable',NEW.lr_date,'Freight payable '||v_label,0,CASE WHEN v_active THEN NEW.freight_payable ELSE 0 END);
 PERFORM public.ledger_set(NEW.business_id,'transporter',NEW.transporter_id,'lrs',NEW.id,'direct_payment',NEW.lr_date,'Consignee paid driver directly ('||v_label||')',CASE WHEN v_active THEN least(v_dp,NEW.freight_payable) ELSE 0 END,0);
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.save_lr(p jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE v_id uuid:=nullif(p->>'id','')::uuid; v_biz uuid:=public.current_business_id(); r jsonb; v_keep uuid[]:='{}'; v_pid uuid; i int:=0; n_cnor int:=0; n_cnee int:=0; v_eid uuid; v_keep_e uuid[]:='{}';
BEGIN
 IF v_biz IS NULL THEN RAISE EXCEPTION 'No business found for the signed-in user'; END IF;
 IF p->>'rate_unit'<>'fixed' AND coalesce(nullif(p->>'weight','')::numeric,0)<=0 THEN RAISE EXCEPTION 'Enter the weight to calculate freight per kg/quintal/tonne'; END IF;
 IF nullif(p->>'rate','') IS NULL THEN RAISE EXCEPTION 'Enter the freight rate'; END IF;
 IF v_id IS NULL THEN INSERT INTO public.lrs(business_id,lr_number) VALUES(v_biz,coalesce(trim(p->>'lr_number'),'')) RETURNING id INTO v_id;
 ELSIF nullif(trim(p->>'lr_number'),'') IS NOT NULL THEN UPDATE public.lrs SET lr_number=trim(p->>'lr_number') WHERE id=v_id; END IF;
 FOR r IN SELECT * FROM jsonb_array_elements(coalesce(p->'parties','[]')) LOOP
 i:=i+1;
 IF nullif(r->>'party_id','') IS NULL THEN RAISE EXCEPTION 'Choose a party for every consignor and consignee'; END IF;
 IF r->>'role'='consignor' THEN n_cnor:=n_cnor+1; ELSE n_cnee:=n_cnee+1; END IF;
 v_pid:=nullif(r->>'id','')::uuid;
 IF v_pid IS NULL OR NOT EXISTS(SELECT 1 FROM public.lr_parties WHERE id=v_pid AND lr_id=v_id) THEN INSERT INTO public.lr_parties(business_id,lr_id,role,party_id) VALUES(v_biz,v_id,r->>'role',(r->>'party_id')::uuid) RETURNING id INTO v_pid; END IF;
 UPDATE public.lr_parties SET role=r->>'role',party_id=(r->>'party_id')::uuid,seq=i,goods_description=nullif(r->>'goods_description',''),quantity=nullif(r->>'quantity','')::numeric,weight=nullif(r->>'weight','')::numeric,loading_point=nullif(r->>'loading_point',''),delivery_point=nullif(r->>'delivery_point','') WHERE id=v_pid;
 v_keep:=v_keep||v_pid;
 FOR r IN SELECT * FROM jsonb_array_elements(coalesce(r->'expenses','[]')) LOOP
 v_eid:=nullif(r->>'id','')::uuid;
 IF coalesce(nullif(r->>'amount','')::numeric,0)<=0 THEN RAISE EXCEPTION 'Every expense needs an amount greater than 0'; END IF;
 IF v_eid IS NULL OR NOT EXISTS(SELECT 1 FROM public.expenses WHERE id=v_eid AND lr_id=v_id) THEN INSERT INTO public.expenses(business_id,scope,lr_id,category,amount) VALUES(v_biz,'consignor',v_id,coalesce(nullif(r->>'category',''),'Other'),(r->>'amount')::numeric) RETURNING id INTO v_eid; END IF;
 UPDATE public.expenses SET scope=(SELECT role FROM public.lr_parties WHERE id=v_pid),lr_party_id=v_pid,trip_id=nullif(p->>'trip_id','')::uuid,category=coalesce(nullif(r->>'category',''),'Other'),amount=(r->>'amount')::numeric,expense_date=coalesce(nullif(r->>'expense_date','')::date,expense_date),paid_by=nullif(r->>'paid_by',''),paid_to=nullif(r->>'paid_to',''),responsible=coalesce(nullif(r->>'responsible',''),'gokul'),responsible_party_id=CASE WHEN r->>'responsible'='party' THEN (SELECT party_id FROM public.lr_parties WHERE id=v_pid) END,payment_method=nullif(r->>'payment_method',''),payment_status=coalesce(nullif(r->>'payment_status',''),'paid'),notes=nullif(r->>'notes',''),is_cancelled=false WHERE id=v_eid;
 v_keep_e:=v_keep_e||v_eid;
 END LOOP;
 END LOOP;
 IF n_cnor=0 OR n_cnee=0 THEN RAISE EXCEPTION 'Add at least one consignor and one consignee'; END IF;
 UPDATE public.expenses SET is_cancelled=true,cancel_reason='Removed from LR' WHERE lr_id=v_id AND scope IN ('consignor','consignee') AND NOT is_cancelled AND NOT(id=ANY(v_keep_e));
 DELETE FROM public.lr_parties WHERE lr_id=v_id AND NOT(id=ANY(v_keep));
 DELETE FROM public.lr_adjustments WHERE lr_id=v_id;
 FOR r IN SELECT * FROM jsonb_array_elements(coalesce(p->'adjustments','[]')) LOOP
 IF coalesce(trim(r->>'reason'),'')='' THEN RAISE EXCEPTION 'Every addition/deduction needs a reason'; END IF;
 INSERT INTO public.lr_adjustments(business_id,lr_id,kind,amount,reason) VALUES(v_biz,v_id,r->>'kind',(r->>'amount')::numeric,trim(r->>'reason'));
 END LOOP;
 UPDATE public.lrs SET lr_date=coalesce(nullif(p->>'lr_date','')::date,lr_date),trip_id=nullif(p->>'trip_id','')::uuid,loading_stop_id=CASE WHEN nullif(p->>'trip_id','') IS NULL THEN NULL ELSE nullif(p->>'loading_stop_id','')::uuid END,unloading_stop_id=CASE WHEN nullif(p->>'trip_id','') IS NULL THEN NULL ELSE nullif(p->>'unloading_stop_id','')::uuid END,goods_description=nullif(p->>'goods_description',''),quantity=nullif(p->>'quantity','')::numeric,weight=nullif(p->>'weight','')::numeric,weight_unit=coalesce(nullif(p->>'weight_unit',''),'kg'),loading_point=nullif(p->>'loading_point',''),delivery_point=nullif(p->>'delivery_point',''),notes=nullif(p->>'notes',''),delivery_status=coalesce(nullif(p->>'delivery_status',''),'pending'),freight_type=coalesce(nullif(p->>'freight_type',''),'to_pay'),billing_party_id=nullif(p->>'billing_party_id','')::uuid,rate_unit=coalesce(nullif(p->>'rate_unit',''),'fixed'),rate=nullif(p->>'rate','')::numeric,transporter_id=nullif(p->>'transporter_id','')::uuid,vehicle_number=nullif(p->>'vehicle_number',''),vehicle_type=nullif(p->>'vehicle_type',''),driver_name=nullif(p->>'driver_name',''),driver_id=nullif(p->>'driver_id','')::uuid,freight_payable=coalesce(nullif(p->>'freight_payable','')::numeric,0),direct_payment_enabled=coalesce((p->>'direct_payment_enabled')::boolean,false),direct_payment_amount=CASE WHEN coalesce((p->>'direct_payment_enabled')::boolean,false) THEN coalesce(nullif(p->>'direct_payment_amount','')::numeric,0) ELSE 0 END,commission_enabled=coalesce((p->>'commission_enabled')::boolean,false),commission_mode=coalesce(nullif(p->>'commission_mode',''),'fixed'),commission_value=coalesce(nullif(p->>'commission_value','')::numeric,0),commission_payer_party_id=NULL,commission_cancel_reason=nullif(p->>'commission_cancel_reason',''),commission_date=nullif(p->>'commission_date','')::date,commission_reference=nullif(p->>'commission_reference',''),commission_notes=nullif(p->>'commission_notes','') WHERE id=v_id;
 RETURN v_id;
END $$;
CREATE OR REPLACE FUNCTION public.save_trip(p jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE v_id uuid:=nullif(p->>'id','')::uuid; v_biz uuid:=public.current_business_id(); s jsonb; v_keep uuid[]:='{}'; v_sid uuid; i int:=0;
BEGIN
 IF v_biz IS NULL THEN RAISE EXCEPTION 'No business found for the signed-in user'; END IF;
 IF v_id IS NULL THEN INSERT INTO public.trips(business_id,trip_number) VALUES(v_biz,'') RETURNING id INTO v_id; END IF;
 UPDATE public.trips SET trip_date=coalesce(nullif(p->>'trip_date','')::date,trip_date),journey_type=coalesce(nullif(p->>'journey_type',''),'single'),direction=coalesce(nullif(p->>'direction',''),'up'),status=coalesce(nullif(p->>'status',''),'booked'),parent_trip_id=nullif(p->>'parent_trip_id','')::uuid,leg_label=nullif(p->>'leg_label',''),vehicle_mode=coalesce(nullif(p->>'vehicle_mode',''),'own'),vehicle_id=CASE WHEN p->>'vehicle_mode'='market' THEN NULL ELSE nullif(p->>'vehicle_id','')::uuid END,market_vehicle_number=CASE WHEN p->>'vehicle_mode'='market' THEN nullif(p->>'market_vehicle_number','') END,market_vehicle_type=CASE WHEN p->>'vehicle_mode'='market' THEN nullif(p->>'market_vehicle_type','') END,transporter_id=nullif(p->>'transporter_id','')::uuid,driver_id=nullif(p->>'driver_id','')::uuid,driver_name=nullif(p->>'driver_name',''),commission_enabled=coalesce((p->>'commission_enabled')::boolean,false),commission_mode=coalesce(nullif(p->>'commission_mode',''),'fixed'),commission_value=coalesce(nullif(p->>'commission_value','')::numeric,0),commission_date=nullif(p->>'commission_date','')::date,commission_reference=p->>'commission_reference',commission_notes=p->>'commission_notes',commission_cancel_reason=p->>'commission_cancel_reason',notes=nullif(p->>'notes',''),cancel_reason=nullif(p->>'cancel_reason','') WHERE id=v_id;
 IF p?'stops' THEN
 FOR s IN SELECT * FROM jsonb_array_elements(p->'stops') LOOP
 i:=i+1;
 IF coalesce(trim(s->>'location'),'')='' THEN RAISE EXCEPTION 'Stop % needs a location',i; END IF;
 v_sid:=nullif(s->>'id','')::uuid;
 IF v_sid IS NULL OR NOT EXISTS(SELECT 1 FROM public.trip_stops WHERE id=v_sid AND trip_id=v_id) THEN INSERT INTO public.trip_stops(business_id,trip_id,location) VALUES(v_biz,v_id,s->>'location') RETURNING id INTO v_sid; END IF;
 UPDATE public.trip_stops SET seq=i,location=trim(s->>'location'),stop_type=coalesce(nullif(s->>'stop_type',''),'intermediate'),planned_arrival=nullif(s->>'planned_arrival','')::timestamptz,planned_departure=nullif(s->>'planned_departure','')::timestamptz,actual_arrival=nullif(s->>'actual_arrival','')::timestamptz,actual_departure=nullif(s->>'actual_departure','')::timestamptz,status=coalesce(nullif(s->>'status',''),'planned'),notes=nullif(s->>'notes','') WHERE id=v_sid;
 v_keep:=v_keep||v_sid;
 END LOOP;
 IF i<2 THEN RAISE EXCEPTION 'A trip needs at least a first stop and a last stop'; END IF;
 DELETE FROM public.trip_stops WHERE trip_id=v_id AND NOT(id=ANY(v_keep));
 END IF;
 RETURN v_id;
END $$;
CREATE OR REPLACE FUNCTION public.salary_payment_before() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_salary numeric; v_paid numeric; v_adv numeric; v_com numeric;
BEGIN
 PERFORM 1 FROM public.drivers WHERE id=NEW.driver_id AND business_id=NEW.business_id FOR UPDATE;
 SELECT amount INTO v_salary FROM public.salary_entries WHERE id=NEW.salary_entry_id AND driver_id=NEW.driver_id AND business_id=NEW.business_id AND NOT is_cancelled FOR UPDATE;
 IF v_salary IS NULL THEN RAISE EXCEPTION 'Salary month not found'; END IF;
 IF TG_OP='UPDATE' AND (NEW.amount,NEW.recovered_advance,NEW.recovered_commission,NEW.driver_id,NEW.salary_entry_id) IS DISTINCT FROM (OLD.amount,OLD.recovered_advance,OLD.recovered_commission,OLD.driver_id,OLD.salary_entry_id) THEN RAISE EXCEPTION 'Reverse this salary payment and record a corrected one'; END IF;
 IF TG_OP='UPDATE' AND OLD.is_reversed AND NOT NEW.is_reversed THEN RAISE EXCEPTION 'A reversed salary payment cannot be restored'; END IF;
 IF NEW.is_reversed THEN IF coalesce(trim(NEW.reversal_reason),'')='' THEN RAISE EXCEPTION 'Reversal reason required'; END IF; RETURN NEW; END IF;
 SELECT coalesce(sum(amount+recovered_advance+recovered_commission),0) INTO v_paid FROM public.salary_payments WHERE salary_entry_id=NEW.salary_entry_id AND NOT is_reversed AND id<>NEW.id;
 IF NEW.amount<0 OR NEW.recovered_advance<0 OR NEW.amount+NEW.recovered_advance+NEW.recovered_commission<=0 OR NEW.amount+NEW.recovered_advance+NEW.recovered_commission>v_salary-v_paid THEN RAISE EXCEPTION 'Payment and recovery exceed outstanding salary or are invalid'; END IF;
 SELECT coalesce(sum(amount),0) INTO v_adv FROM public.advances WHERE driver_id=NEW.driver_id AND recipient_type='driver' AND NOT is_cancelled;
 SELECT v_adv-coalesce(sum(recovered_advance),0) INTO v_adv FROM public.salary_payments WHERE driver_id=NEW.driver_id AND NOT is_reversed AND id<>NEW.id;
 IF NEW.recovered_advance>greatest(0,v_adv) THEN RAISE EXCEPTION 'Recovery exceeds unrecovered advances'; END IF;
 SELECT coalesce(sum(pending_amount),0) INTO v_com FROM public.commission_balances WHERE driver_id=NEW.driver_id;
 IF NEW.recovered_commission>v_com THEN RAISE EXCEPTION 'Recovery exceeds pending commission'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER b_salary_payment_guard BEFORE INSERT OR UPDATE ON public.salary_payments FOR EACH ROW EXECUTE FUNCTION public.salary_payment_before();
CREATE OR REPLACE FUNCTION public.salary_payment_after() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c record; v_left numeric:=NEW.recovered_commission; v_take numeric;
BEGIN
 PERFORM public.ledger_set(NEW.business_id,'driver',NEW.driver_id,'salary_payments',NEW.id,'salary_paid',NEW.payment_date,'Salary settled (cash/bank and confirmed recoveries)',CASE WHEN NEW.is_reversed THEN 0 ELSE NEW.amount+NEW.recovered_advance+NEW.recovered_commission END,0);
 PERFORM public.ledger_set(NEW.business_id,'driver',NEW.driver_id,'salary_payments',NEW.id,'advance_recovered',NEW.payment_date,'Advance recovered from salary',0,CASE WHEN NEW.is_reversed THEN 0 ELSE NEW.recovered_advance END);
 IF NEW.is_reversed THEN UPDATE public.commission_receipts SET is_reversed=true,reversal_reason=NEW.reversal_reason WHERE salary_payment_id=NEW.id AND NOT is_reversed;
 ELSIF TG_OP='INSERT' AND v_left>0 THEN
 FOR c IN SELECT * FROM public.commission_balances WHERE driver_id=NEW.driver_id AND pending_amount>0 ORDER BY commission_date,id LOOP
 v_take:=least(v_left,c.pending_amount);
 INSERT INTO public.commission_receipts(business_id,commission_id,driver_id,amount,receipt_date,salary_payment_id,request_id,reference,notes) VALUES(NEW.business_id,c.id,NEW.driver_id,v_take,NEW.payment_date,NEW.id,gen_random_uuid(),NEW.reference,'Confirmed salary recovery');
 v_left:=v_left-v_take; EXIT WHEN v_left=0;
 END LOOP;
 IF v_left>0 THEN RAISE EXCEPTION 'Commission recovery changed; try again'; END IF;
 END IF;
 RETURN NEW;
END $$;