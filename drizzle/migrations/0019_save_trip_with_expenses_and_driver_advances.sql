-- 0019: Trip form can now save expenses and driver advances in the SAME atomic call as the trip and its stops.
--
-- Purpose (Part 2): the Trip form gets TOLL TAX / CNG / FOOD / POLICE + additional expenses and a Driver Advance section.
-- This REPLACES one function (public.save_trip) with a superset of the current version (0002 + the 0006 safety patches):
--   * everything the current save_trip does is kept exactly (trip fields, commission fields, stop upsert by id, stop-in-use guard, trip row lock);
--   * NEW optional "expenses": [...] and "advances": [...] arrays. If a key is absent nothing about expenses/advances changes.
--   * Rows are matched by id (the browser generates the id for a new row), so saving twice / retrying a request can never create a duplicate.
--   * Rows that are not sent are NEVER deleted or cancelled. Cancelling is explicit ("cancel": true + "cancel_reason") and goes through the
--     existing triggers, which post an offsetting ledger line. Money history is never silently erased.
--   * Advances handled here are DRIVER advances only (recipient_type='driver'); transporter / truck-owner advances stay on the trip page.
--   * Optional "client_id" (uuid) on a NEW trip makes a retried request return the same trip instead of creating a second one.
--
-- Safe: no table, column, trigger, policy or row is created, changed or dropped. Existing data is untouched.
-- Prerequisite: none (0001, 0002, 0006 must already be applied, which they are if the app works today).
-- Run order: 0019 first, then 0020 (trip documents; optional). Run in the Supabase SQL editor of the live project.
-- Rollback: re-run the save_trip definition from 0002 and then the 0006 patch block, or ask for a rollback script.
-- NOT executed or syntax-checked by the author (no database was available) - run it in a copy/staging project first if you have one.

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

 -- ===== Trip expenses (scope 'trip', borne by Gokul). Only keys that are present in a row are changed on an existing expense. =====
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

 -- ===== Driver advances (recipient_type 'driver'). The existing advance_after trigger posts / updates / reverses the DRIVER ledger line keyed on the advance id. =====
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

-- Verify after running (read-only):
--   SELECT pg_get_functiondef('public.save_trip(jsonb)'::regprocedure) LIKE '%Driver advances%' AS new_version_installed;
