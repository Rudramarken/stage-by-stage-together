CREATE TABLE public.trip_journey_entries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), business_id uuid NOT NULL REFERENCES public.businesses(id), trip_id uuid NOT NULL REFERENCES public.trips(id),
 journey text NOT NULL CHECK(journey IN ('main','return')), role text NOT NULL CHECK(role IN ('consignor','consignee','transporter')), seq integer NOT NULL DEFAULT 0,
 party_id uuid REFERENCES public.parties(id), transporter_id uuid REFERENCES public.transporters(id),
 weight numeric CHECK(weight>=0), rate numeric CHECK(rate>=0), freight_amount numeric NOT NULL DEFAULT 0 CHECK(freight_amount>=0), shortage numeric CHECK(shortage>=0), addition numeric CHECK(addition>=0), freight_date date NOT NULL,
 goods_description text, loading_point text, delivery_point text, expenses jsonb NOT NULL DEFAULT '[]'::jsonb,
 is_cancelled boolean NOT NULL DEFAULT false, cancel_reason text, created_by uuid DEFAULT auth.uid(), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK((role='transporter' AND transporter_id IS NOT NULL AND party_id IS NULL) OR(role<>'transporter' AND party_id IS NOT NULL AND transporter_id IS NULL))
);
GRANT SELECT,INSERT,UPDATE ON public.trip_journey_entries TO authenticated;
GRANT ALL ON public.trip_journey_entries TO service_role;
ALTER TABLE public.trip_journey_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY journey_read ON public.trip_journey_entries FOR SELECT TO authenticated USING(public.is_business_member(business_id));
CREATE POLICY journey_insert ON public.trip_journey_entries FOR INSERT TO authenticated WITH CHECK(public.is_business_member(business_id));
CREATE POLICY journey_update ON public.trip_journey_entries FOR UPDATE TO authenticated USING(public.is_business_member(business_id)) WITH CHECK(public.is_business_member(business_id));
CREATE INDEX journey_trip_idx ON public.trip_journey_entries(business_id,trip_id,journey,seq);
CREATE TRIGGER a_stamp_journey BEFORE INSERT ON public.trip_journey_entries FOR EACH ROW EXECUTE FUNCTION public.stamp_business_id();
CREATE OR REPLACE FUNCTION public.trip_journey_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE x jsonb; old_exp jsonb;
BEGIN
 IF TG_OP='UPDATE' AND OLD.is_cancelled THEN RAISE EXCEPTION 'Cancelled journey entry cannot be edited'; END IF;
 IF TG_OP='UPDATE' AND (NEW.trip_id,NEW.business_id,NEW.journey,NEW.role) IS DISTINCT FROM (OLD.trip_id,OLD.business_id,OLD.journey,OLD.role) THEN RAISE EXCEPTION 'Journey identity cannot be changed'; END IF;
 IF NEW.is_cancelled AND nullif(trim(NEW.cancel_reason),'') IS NULL THEN RAISE EXCEPTION 'Cancellation reason required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.trips WHERE id=NEW.trip_id AND business_id=NEW.business_id AND(status<>'cancelled' OR NEW.is_cancelled)) THEN RAISE EXCEPTION 'Trip unavailable in your business'; END IF;
 IF NEW.party_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.parties WHERE id=NEW.party_id AND business_id=NEW.business_id) THEN RAISE EXCEPTION 'Party unavailable in your business'; END IF;
 IF NEW.transporter_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.transporters WHERE id=NEW.transporter_id AND business_id=NEW.business_id) THEN RAISE EXCEPTION 'Transporter unavailable in your business'; END IF;
 IF NEW.freight_amount<>round(NEW.freight_amount,2) OR NEW.rate<>round(NEW.rate,2) OR NEW.shortage<>round(NEW.shortage,2) OR NEW.addition<>round(NEW.addition,2) THEN RAISE EXCEPTION 'Money may have at most two decimals'; END IF;
 IF jsonb_typeof(NEW.expenses)<>'array' OR (NEW.role<>'consignor' AND jsonb_array_length(NEW.expenses)>0) THEN RAISE EXCEPTION 'Only consignors have these payables'; END IF;
 FOR x IN SELECT * FROM jsonb_array_elements(NEW.expenses) LOOP
 IF nullif(x->>'id','') IS NULL OR nullif(trim(x->>'category'),'') IS NULL OR coalesce(nullif(x->>'amount','')::numeric,0)<=0 OR (x->>'amount')::numeric<>round((x->>'amount')::numeric,2) OR nullif(x->>'expense_date','')::date IS NULL THEN RAISE EXCEPTION 'Consignor payable needs identity, category, positive amount and date'; END IF;
 END LOOP;
 IF TG_OP='UPDATE' AND NOT NEW.is_cancelled THEN FOR old_exp IN SELECT * FROM jsonb_array_elements(OLD.expenses) LOOP
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.expenses) x WHERE x->>'id'=old_exp->>'id') THEN RAISE EXCEPTION 'Saved consignor payables cannot be removed; cancel the journey entry with a reason'; END IF; END LOOP; END IF;
 NEW.updated_at:=now(); RETURN NEW;
END $$;
CREATE TRIGGER b_guard_journey BEFORE INSERT OR UPDATE ON public.trip_journey_entries FOR EACH ROW EXECUTE FUNCTION public.trip_journey_guard();
CREATE OR REPLACE FUNCTION public.trip_journey_after() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE l public.ledger_entries; x jsonb; label text;
BEGIN
 SELECT 'Trip '||trip_number||' · '||NEW.journey||' journey' INTO label FROM public.trips WHERE id=NEW.trip_id;
 IF NEW.is_cancelled THEN
 FOR l IN SELECT * FROM public.ledger_entries WHERE business_id=NEW.business_id AND source_table='trip_journey_entries' AND source_id=NEW.id AND reversal_of IS NULL AND line_kind NOT LIKE '%_reversal' LOOP
 PERFORM public.post_ledger(NEW.business_id,l.account_type,l.account_id,'trip_journey_entries',NEW.id,l.line_kind||'_reversal',(now() AT TIME ZONE 'Asia/Kolkata')::date,'Reversal: '||NEW.cancel_reason,l.credit,l.debit);
 UPDATE public.ledger_entries SET reversal_of=l.id WHERE business_id=NEW.business_id AND source_table='trip_journey_entries' AND source_id=NEW.id AND line_kind=l.line_kind||'_reversal';
 END LOOP;
 ELSE
 PERFORM public.ledger_set(NEW.business_id,CASE WHEN NEW.role='transporter' THEN 'transporter' ELSE 'party' END,coalesce(NEW.transporter_id,NEW.party_id),'trip_journey_entries',NEW.id,'journey_freight',NEW.freight_date,CASE WHEN NEW.role='transporter' THEN 'Freight receivable · ' ELSE 'Party freight · ' END||label,NEW.freight_amount,0);
 FOR x IN SELECT * FROM jsonb_array_elements(NEW.expenses) LOOP
 PERFORM public.ledger_set(NEW.business_id,'party',NEW.party_id,'trip_journey_entries',NEW.id,'consignor_payable_'||(x->>'id'),(x->>'expense_date')::date,'Consignor payable · '||(x->>'category')||' · '||label,0,(x->>'amount')::numeric);
 END LOOP;
 END IF;
 INSERT INTO public.audit_logs(business_id,table_name,record_id,action,old_data,new_data,user_id) VALUES(NEW.business_id,'trip_journey_entries',NEW.id,TG_OP,CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) END,to_jsonb(NEW),auth.uid());
 RETURN NEW;
END $$;
CREATE TRIGGER c_post_journey AFTER INSERT OR UPDATE ON public.trip_journey_entries FOR EACH ROW EXECUTE FUNCTION public.trip_journey_after();
CREATE OR REPLACE FUNCTION public.cancel_trip_journeys() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN IF NEW.status='cancelled' AND OLD.status<>'cancelled' THEN UPDATE public.trip_journey_entries SET is_cancelled=true,cancel_reason=NEW.cancel_reason WHERE trip_id=NEW.id AND business_id=NEW.business_id AND NOT is_cancelled; END IF; RETURN NEW; END $$;
CREATE TRIGGER cancel_journeys AFTER UPDATE OF status ON public.trips FOR EACH ROW EXECUTE FUNCTION public.cancel_trip_journeys();
CREATE OR REPLACE FUNCTION public.save_trip_journeys(p jsonb) RETURNS uuid LANGUAGE plpgsql SET search_path=public AS $$
DECLARE tid uuid; biz uuid:=public.current_business_id(); r jsonb; eid uuid; oldrow public.trip_journey_entries; i integer:=0;
BEGIN
 IF auth.uid() IS NULL OR biz IS NULL THEN RAISE EXCEPTION 'Sign in with business access required'; END IF;
 tid:=public.save_trip(p-'journey_entries');
 IF p?'journey_entries' THEN
 FOR r IN SELECT * FROM jsonb_array_elements(p->'journey_entries') LOOP
 i:=i+1; eid:=(r->>'id')::uuid;
 SELECT * INTO oldrow FROM public.trip_journey_entries WHERE id=eid FOR UPDATE;
 IF FOUND AND (oldrow.business_id<>biz OR oldrow.trip_id<>tid) THEN RAISE EXCEPTION 'Journey entry does not belong to this trip'; END IF;
 IF coalesce((r->>'cancel')::boolean,false) THEN
 IF nullif(trim(r->>'cancel_reason'),'') IS NULL THEN RAISE EXCEPTION 'Cancellation reason required'; END IF;
 IF oldrow.id IS NOT NULL AND NOT oldrow.is_cancelled THEN UPDATE public.trip_journey_entries SET is_cancelled=true,cancel_reason=r->>'cancel_reason' WHERE id=eid AND business_id=biz; END IF; CONTINUE; END IF;
 IF oldrow.is_cancelled THEN RAISE EXCEPTION 'Cancelled entry cannot be saved'; END IF;
 INSERT INTO public.trip_journey_entries(id,business_id,trip_id,journey,role,seq,party_id,transporter_id,weight,rate,freight_amount,shortage,addition,freight_date,goods_description,loading_point,delivery_point,expenses)
 VALUES(eid,biz,tid,r->>'journey',r->>'role',i,nullif(r->>'party_id','')::uuid,nullif(r->>'transporter_id','')::uuid,nullif(r->>'weight','')::numeric,nullif(r->>'rate','')::numeric,coalesce(nullif(r->>'freight_amount','')::numeric,0),nullif(r->>'shortage','')::numeric,nullif(r->>'addition','')::numeric,(r->>'freight_date')::date,r->>'goods_description',r->>'loading_point',r->>'delivery_point',coalesce(r->'expenses','[]'::jsonb))
 ON CONFLICT(id) DO UPDATE SET seq=excluded.seq,party_id=excluded.party_id,transporter_id=excluded.transporter_id,weight=excluded.weight,rate=excluded.rate,freight_amount=excluded.freight_amount,shortage=excluded.shortage,addition=excluded.addition,freight_date=excluded.freight_date,goods_description=excluded.goods_description,loading_point=excluded.loading_point,delivery_point=excluded.delivery_point,expenses=excluded.expenses;
 END LOOP; END IF;
 RETURN tid;
END $$;
ALTER TABLE public.expenses ADD COLUMN consignor_payable boolean NOT NULL DEFAULT false, ADD COLUMN payable_party_id uuid REFERENCES public.parties(id);
CREATE OR REPLACE FUNCTION public.expense_after() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.responsible='party' AND NEW.responsible_party_id IS NULL THEN RAISE EXCEPTION 'Choose which party is responsible for this expense'; END IF;
 IF NEW.consignor_payable AND (NEW.scope<>'consignor' OR NEW.payable_party_id IS NULL OR NEW.responsible<>'gokul' OR NEW.payment_status<>'pending' OR NEW.account_id IS NOT NULL) THEN RAISE EXCEPTION 'Consignor payable must identify its consignor and remain unpaid; record payment separately'; END IF;
 IF NEW.payable_party_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.parties WHERE id=NEW.payable_party_id AND business_id=NEW.business_id) THEN RAISE EXCEPTION 'Payable party unavailable in your business'; END IF;
 PERFORM public.ledger_set(NEW.business_id,'party',CASE WHEN NEW.responsible='party' THEN NEW.responsible_party_id END,'expenses',NEW.id,'charged_to_party',NEW.expense_date,'Expense charged: '||NEW.category,CASE WHEN NEW.is_cancelled OR NEW.responsible<>'party' THEN 0 ELSE NEW.amount END,0);
 PERFORM public.ledger_set(NEW.business_id,'party',CASE WHEN NEW.consignor_payable THEN NEW.payable_party_id END,'expenses',NEW.id,'consignor_payable',NEW.expense_date,'Consignor payable: '||NEW.category||' · LR '||coalesce((SELECT lr_number FROM public.lrs WHERE id=NEW.lr_id),''),0,CASE WHEN NEW.is_cancelled OR NOT NEW.consignor_payable THEN 0 ELSE NEW.amount END);
 RETURN NEW;
END $$;
DO $$ DECLARE d text; BEGIN
 SELECT pg_get_functiondef('public.save_lr(jsonb)'::regprocedure) INTO d;
 IF position('UPDATE public.expenses SET scope=(SELECT role FROM public.lr_parties WHERE id=v_pid)' IN d)=0 THEN RAISE EXCEPTION 'Unexpected save_lr definition'; END IF;
 d:=replace(d,'UPDATE public.expenses SET scope=(SELECT role FROM public.lr_parties WHERE id=v_pid)','UPDATE public.expenses SET consignor_payable=coalesce((r->>''consignor_payable'')::boolean,false),payable_party_id=CASE WHEN coalesce((r->>''consignor_payable'')::boolean,false) THEN (SELECT party_id FROM public.lr_parties WHERE id=v_pid) END,account_id=nullif(r->>''account_id'','''')::uuid,reference=nullif(r->>''reference'',''''),scope=(SELECT role FROM public.lr_parties WHERE id=v_pid)');
 EXECUTE d;
END $$;
REVOKE ALL ON FUNCTION public.save_trip_journeys(jsonb), public.trip_journey_guard(), public.trip_journey_after(), public.cancel_trip_journeys() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_trip_journeys(jsonb), public.trip_journey_guard(), public.trip_journey_after(), public.cancel_trip_journeys() TO authenticated,service_role;
NOTIFY pgrst,'reload schema';