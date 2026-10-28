ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS driver_id uuid REFERENCES public.drivers(id);
CREATE INDEX IF NOT EXISTS vehicles_driver_id_idx ON public.vehicles(driver_id);

CREATE OR REPLACE FUNCTION public.save_trip(p jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE
 v_id uuid:=nullif(p->>'id','')::uuid;
 v_cid uuid:=nullif(p->>'client_id','')::uuid;
 v_biz uuid:=public.current_business_id();
 s jsonb; v_keep uuid[]:='{}'; v_sid uuid; i int:=0;
 r jsonb; n int:=0; v_rid uuid; v_found boolean; v_amt numeric; v_cancel boolean; v_reason text;
 v_etrip uuid; v_ekind text; v_ecan boolean; v_did uuid; v_acct uuid; v_adate date;
BEGIN
 IF v_biz IS NULL THEN RAISE EXCEPTION 'No business found for the signed-in user'; END IF;
 IF v_id IS NULL AND v_cid IS NOT NULL AND EXISTS(SELECT 1 FROM public.trips WHERE id=v_cid AND business_id=v_biz) THEN v_id:=v_cid; END IF;
 IF v_id IS NOT NULL THEN
  PERFORM 1 FROM public.trips WHERE id=v_id AND business_id=v_biz AND status<>'cancelled' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Record not found, cancelled or access denied'; END IF;
 ELSE
  INSERT INTO public.trips(id,business_id,trip_number) VALUES(coalesce(v_cid,gen_random_uuid()),v_biz,'') RETURNING id INTO v_id;
 END IF;
 UPDATE public.trips SET trip_date=coalesce(nullif(p->>'trip_date','')::date,trip_date),journey_type=coalesce(nullif(p->>'journey_type',''),'single'),direction=coalesce(nullif(p->>'direction',''),'up'),status=coalesce(nullif(p->>'status',''),'booked'),parent_trip_id=nullif(p->>'parent_trip_id','')::uuid,leg_label=nullif(p->>'leg_label',''),vehicle_mode=coalesce(nullif(p->>'vehicle_mode',''),'own'),vehicle_id=CASE WHEN p->>'vehicle_mode'='market' THEN NULL ELSE nullif(p->>'vehicle_id','')::uuid END,market_vehicle_number=CASE WHEN p->>'vehicle_mode'='market' THEN nullif(p->>'market_vehicle_number','') END,market_vehicle_type=CASE WHEN p->>'vehicle_mode'='market' THEN nullif(p->>'market_vehicle_type','') END,transporter_id=nullif(p->>'transporter_id','')::uuid,driver_id=nullif(p->>'driver_id','')::uuid,driver_name=nullif(p->>'driver_name',''),commission_enabled=coalesce((p->>'commission_enabled')::boolean,false),commission_mode=coalesce(nullif(p->>'commission_mode',''),'fixed'),commission_value=coalesce(nullif(p->>'commission_value','')::numeric,0),commission_date=nullif(p->>'commission_date','')::date,commission_reference=p->>'commission_reference',commission_notes=p->>'commission_notes',commission_cancel_reason=p->>'commission_cancel_reason',notes=nullif(p->>'notes',''),cancel_reason=nullif(p->>'cancel_reason','') WHERE id=v_id;
 IF p?'stops' THEN
 FOR s IN SELECT * FROM jsonb_array_elements(p->'stops') LOOP
 i:=i+1;
 IF coalesce(trim(s->>'location'),'')='' THEN RAISE EXCEPTION 'Stop % needs a location',i; END IF;
 v_sid:=nullif(s->>'id','')::uuid;
 IF v_sid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.trip_stops WHERE id=v_sid AND trip_id=v_id AND business_id=v_biz) THEN RAISE EXCEPTION 'Stop does not belong to this trip'; END IF;
 IF v_sid IS NULL THEN INSERT INTO public.trip_stops(business_id,trip_id,location) VALUES(v_biz,v_id,s->>'location') RETURNING id INTO v_sid; END IF;
 UPDATE public.trip_stops SET seq=i,location=trim(s->>'location'),stop_type=coalesce(nullif(s->>'stop_type',''),'intermediate'),planned_arrival=nullif(s->>'planned_arrival','')::timestamptz,planned_departure=nullif(s->>'planned_departure','')::timestamptz,actual_arrival=nullif(s->>'actual_arrival','')::timestamptz,actual_departure=nullif(s->>'actual_departure','')::timestamptz,status=coalesce(nullif(s->>'status',''),'planned'),notes=nullif(s->>'notes','') WHERE id=v_sid;
 v_keep:=v_keep||v_sid;
 END LOOP;
 IF i<2 THEN RAISE EXCEPTION 'A trip needs at least a first stop and a last stop'; END IF;
 IF EXISTS(SELECT 1 FROM public.trip_stops s JOIN public.lrs l ON l.loading_stop_id=s.id OR l.unloading_stop_id=s.id WHERE s.trip_id=v_id AND NOT(s.id=ANY(v_keep))) THEN RAISE EXCEPTION 'A removed stop is linked to an LR; edit that LR first'; END IF;
 DELETE FROM public.trip_stops WHERE trip_id=v_id AND NOT(id=ANY(v_keep));
 END IF;
 IF p?'expenses' AND jsonb_typeof(p->'expenses')='array' THEN
 n:=0;
 FOR r IN SELECT * FROM jsonb_array_elements(p->'expenses') LOOP
  n:=n+1;
  v_rid:=nullif(r->>'id','')::uuid;
  v_cancel:=coalesce((r->>'cancel')::boolean,false);
  v_found:=false; v_etrip:=NULL; v_ekind:=NULL; v_ecan:=NULL;
  IF v_rid IS NOT NULL THEN
   SELECT trip_id,scope,is_cancelled INTO v_etrip,v_ekind,v_ecan FROM public.expenses WHERE id=v_rid AND business_id=v_biz FOR UPDATE;
   v_found:=FOUND;
   IF v_found AND (v_etrip IS DISTINCT FROM v_id OR v_ekind<>'trip') THEN RAISE EXCEPTION 'Expense % does not belong to this trip',n; END IF;
   IF v_found AND v_ecan THEN
    IF v_cancel THEN CONTINUE; END IF;
    RAISE EXCEPTION 'Expense % was already cancelled; refresh the trip and try again',n;
   END IF;
  END IF;
  IF v_cancel THEN
   v_reason:=nullif(trim(coalesce(r->>'cancel_reason','')),'');
   IF v_reason IS NULL THEN RAISE EXCEPTION 'Expense % needs a reason to be cancelled',n; END IF;
   IF v_found THEN UPDATE public.expenses SET is_cancelled=true,cancel_reason=v_reason,updated_at=now() WHERE id=v_rid AND business_id=v_biz AND trip_id=v_id; END IF;
   CONTINUE;
  END IF;
  v_amt:=nullif(trim(coalesce(r->>'amount','')),'')::numeric;
  IF v_amt IS NULL OR v_amt<=0 OR v_amt<>round(v_amt,2) THEN RAISE EXCEPTION 'Expense % needs an amount greater than 0 (at most 2 decimals)',n; END IF;
  IF v_found IS NOT TRUE AND coalesce(trim(r->>'category'),'')='' THEN RAISE EXCEPTION 'Expense % needs a category',n; END IF;
  v_acct:=nullif(r->>'account_id','')::uuid;
  IF v_acct IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.payment_accounts WHERE id=v_acct AND business_id=v_biz) THEN RAISE EXCEPTION 'Expense %: cash/bank account not found',n; END IF;
  IF v_found THEN
   UPDATE public.expenses SET
    amount=v_amt,
    category=CASE WHEN r?'category' AND coalesce(trim(r->>'category'),'')<>'' THEN trim(r->>'category') ELSE category END,
    expense_date=CASE WHEN r?'expense_date' AND nullif(r->>'expense_date','') IS NOT NULL THEN (r->>'expense_date')::date ELSE expense_date END,
    paid_to=CASE WHEN r?'paid_to' THEN nullif(r->>'paid_to','') ELSE paid_to END,
    paid_by=CASE WHEN r?'paid_by' THEN nullif(r->>'paid_by','') ELSE paid_by END,
    payment_method=CASE WHEN r?'payment_method' THEN nullif(r->>'payment_method','') ELSE payment_method END,
    account_id=CASE WHEN r?'account_id' THEN v_acct ELSE account_id END,
    reference=CASE WHEN r?'reference' THEN nullif(r->>'reference','') ELSE reference END,
    notes=CASE WHEN r?'notes' THEN nullif(r->>'notes','') ELSE notes END,
    updated_at=now()
   WHERE id=v_rid AND business_id=v_biz AND trip_id=v_id;
  ELSE
   INSERT INTO public.expenses(id,business_id,scope,trip_id,category,amount,expense_date,paid_to,paid_by,responsible,payment_method,account_id,reference,notes)
   VALUES(coalesce(v_rid,gen_random_uuid()),v_biz,'trip',v_id,trim(r->>'category'),v_amt,coalesce(nullif(r->>'expense_date','')::date,(now() AT TIME ZONE 'Asia/Kolkata')::date),nullif(r->>'paid_to',''),nullif(r->>'paid_by',''),'gokul',nullif(r->>'payment_method',''),v_acct,nullif(r->>'reference',''),nullif(r->>'notes',''));
  END IF;
 END LOOP;
 END IF;
 IF p?'advances' AND jsonb_typeof(p->'advances')='array' THEN
 n:=0;
 FOR r IN SELECT * FROM jsonb_array_elements(p->'advances') LOOP
  n:=n+1;
  v_rid:=nullif(r->>'id','')::uuid;
  v_cancel:=coalesce((r->>'cancel')::boolean,false);
  v_found:=false; v_etrip:=NULL; v_ekind:=NULL; v_ecan:=NULL; v_did:=NULL;
  IF v_rid IS NOT NULL THEN
   SELECT trip_id,recipient_type,is_cancelled,driver_id INTO v_etrip,v_ekind,v_ecan,v_did FROM public.advances WHERE id=v_rid AND business_id=v_biz FOR UPDATE;
   v_found:=FOUND;
   IF v_found AND (v_etrip IS DISTINCT FROM v_id OR v_ekind<>'driver') THEN RAISE EXCEPTION 'Advance % does not belong to this trip or is not a driver advance',n; END IF;
   IF v_found AND v_ecan THEN
    IF v_cancel THEN CONTINUE; END IF;
    RAISE EXCEPTION 'Advance % was already cancelled; refresh the trip and try again',n;
   END IF;
  END IF;
  IF v_cancel THEN
   v_reason:=nullif(trim(coalesce(r->>'cancel_reason','')),'');
   IF v_reason IS NULL THEN RAISE EXCEPTION 'Advance % needs a reason to be cancelled',n; END IF;
   IF v_found THEN UPDATE public.advances SET is_cancelled=true,cancel_reason=v_reason,updated_at=now() WHERE id=v_rid AND business_id=v_biz AND trip_id=v_id; END IF;
   CONTINUE;
  END IF;
  v_amt:=nullif(trim(coalesce(r->>'amount','')),'')::numeric;
  IF v_amt IS NULL OR v_amt<=0 OR v_amt<>round(v_amt,2) THEN RAISE EXCEPTION 'Advance % needs an amount greater than 0 (at most 2 decimals)',n; END IF;
  v_adate:=coalesce(nullif(r->>'advance_date','')::date,(now() AT TIME ZONE 'Asia/Kolkata')::date);
  v_acct:=nullif(r->>'account_id','')::uuid;
  IF v_acct IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.payment_accounts WHERE id=v_acct AND business_id=v_biz) THEN RAISE EXCEPTION 'Advance %: cash/bank account not found',n; END IF;
  IF v_found THEN
   IF nullif(r->>'driver_id','') IS NOT NULL AND (r->>'driver_id')::uuid IS DISTINCT FROM v_did THEN RAISE EXCEPTION 'Advance %: to change the driver, cancel this advance and add a new one',n; END IF;
   UPDATE public.advances SET
    amount=v_amt,
    advance_date=v_adate,
    payment_method=CASE WHEN r?'payment_method' THEN nullif(r->>'payment_method','') ELSE payment_method END,
    account_id=CASE WHEN r?'account_id' THEN v_acct ELSE account_id END,
    reference=CASE WHEN r?'reference' THEN nullif(r->>'reference','') ELSE reference END,
    notes=CASE WHEN r?'notes' THEN nullif(r->>'notes','') ELSE notes END,
    updated_at=now()
   WHERE id=v_rid AND business_id=v_biz AND trip_id=v_id;
  ELSE
   v_did:=nullif(r->>'driver_id','')::uuid;
   IF v_did IS NULL THEN RAISE EXCEPTION 'Advance % needs a registered driver (an advance cannot reach a driver ledger without one)',n; END IF;
   IF NOT EXISTS(SELECT 1 FROM public.drivers WHERE id=v_did AND business_id=v_biz) THEN RAISE EXCEPTION 'Advance %: driver not found in your business',n; END IF;
   INSERT INTO public.advances(id,business_id,trip_id,recipient_type,driver_id,advance_date,amount,payment_method,account_id,reference,notes)
   VALUES(coalesce(v_rid,gen_random_uuid()),v_biz,v_id,'driver',v_did,v_adate,v_amt,nullif(r->>'payment_method',''),v_acct,nullif(r->>'reference',''),nullif(r->>'notes',''));
  END IF;
 END LOOP;
 END IF;
 RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.save_trip(jsonb) TO authenticated;

CREATE TABLE IF NOT EXISTS public.trip_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  storage_path text NOT NULL UNIQUE,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS trip_documents_trip ON public.trip_documents(trip_id);
GRANT SELECT, INSERT, DELETE ON public.trip_documents TO authenticated;
GRANT ALL ON public.trip_documents TO service_role;
ALTER TABLE public.trip_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "members select" ON public.trip_documents;
CREATE POLICY "members select" ON public.trip_documents FOR SELECT TO authenticated USING (public.is_business_member(business_id));
DROP POLICY IF EXISTS "members insert" ON public.trip_documents;
CREATE POLICY "members insert" ON public.trip_documents FOR INSERT TO authenticated
  WITH CHECK (public.is_business_member(business_id) AND EXISTS (SELECT 1 FROM public.trips t WHERE t.id = trip_id AND t.business_id = trip_documents.business_id));
DROP POLICY IF EXISTS "members delete" ON public.trip_documents;
CREATE POLICY "members delete" ON public.trip_documents FOR DELETE TO authenticated USING (public.is_business_member(business_id));
DROP TRIGGER IF EXISTS a_stamp_business ON public.trip_documents;
CREATE TRIGGER a_stamp_business BEFORE INSERT OR UPDATE ON public.trip_documents FOR EACH ROW EXECUTE FUNCTION public.stamp_business_id();
DROP TRIGGER IF EXISTS z_audit ON public.trip_documents;
CREATE TRIGGER z_audit AFTER INSERT OR UPDATE OR DELETE ON public.trip_documents FOR EACH ROW EXECUTE FUNCTION public.write_audit();

DROP POLICY IF EXISTS "trip docs select" ON storage.objects;
CREATE POLICY "trip docs select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'trip-documents' AND public.is_business_member(((storage.foldername(name))[1])::uuid));
DROP POLICY IF EXISTS "trip docs insert" ON storage.objects;
CREATE POLICY "trip docs insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'trip-documents' AND public.is_business_member(((storage.foldername(name))[1])::uuid));
DROP POLICY IF EXISTS "trip docs delete" ON storage.objects;
CREATE POLICY "trip docs delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'trip-documents' AND public.is_business_member(((storage.foldername(name))[1])::uuid));