ALTER TABLE public.lrs ADD COLUMN cancelled_by uuid, ADD COLUMN cancelled_at timestamptz;
ALTER TABLE public.trips ADD COLUMN cancelled_by uuid, ADD COLUMN cancelled_at timestamptz;
CREATE OR REPLACE FUNCTION public.removal_blockers(p_table text,p_id uuid,p_history boolean DEFAULT false) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v text;
BEGIN
 SELECT string_agg(label,'; ') INTO v FROM (
 SELECT DISTINCT 'Payment/receipt '||coalesce(nullif(p.reference,''),nullif(p.txn_reference,''),p.id::text)||' ('||p.payment_date||', ₹'||p.amount||')' label
 FROM public.payments p WHERE (p_history OR NOT p.is_reversed) AND (CASE WHEN p_table='lrs' THEN p.lr_id=p_id OR EXISTS(SELECT 1 FROM public.payment_allocations a WHERE a.payment_id=p.id AND a.lr_id=p_id) ELSE p.trip_id=p_id OR p.lr_id IN(SELECT id FROM public.lrs WHERE trip_id=p_id) OR EXISTS(SELECT 1 FROM public.payment_allocations a JOIN public.lrs l ON l.id=a.lr_id WHERE a.payment_id=p.id AND l.trip_id=p_id) END)
 UNION ALL
 SELECT 'Commission receipt '||coalesce(nullif(r.reference,''),r.id::text)||' (₹'||r.amount||')'||CASE WHEN r.salary_payment_id IS NOT NULL THEN ' — reverse salary payment '||r.salary_payment_id ELSE '' END FROM public.commission_receipts r JOIN public.driver_commissions c ON c.id=r.commission_id WHERE (p_history OR NOT r.is_reversed) AND CASE WHEN p_table='lrs' THEN c.lr_id=p_id ELSE c.trip_id=p_id OR c.lr_id IN(SELECT id FROM public.lrs WHERE trip_id=p_id) END
 ) x; RETURN v;
END $$;
REVOKE ALL ON FUNCTION public.removal_blockers(text,uuid,boolean) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.document_removal_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v text;
BEGIN
 IF TG_OP='UPDATE' AND OLD.status='cancelled' THEN
  IF NEW.status<>'cancelled' THEN RAISE EXCEPTION 'Cancelled documents cannot be restored; create a new document'; END IF;
  NEW.cancelled_by:=OLD.cancelled_by; NEW.cancelled_at:=OLD.cancelled_at; NEW.cancel_reason:=OLD.cancel_reason; RETURN NEW;
 END IF;
 IF NEW.status='cancelled' THEN
  IF nullif(trim(NEW.cancel_reason),'') IS NULL THEN RAISE EXCEPTION 'Cancellation reason required'; END IF;
  LOCK TABLE public.payments,public.payment_allocations,public.commission_receipts IN SHARE ROW EXCLUSIVE MODE;
  v:=public.removal_blockers(TG_TABLE_NAME,NEW.id,false);
  IF v IS NOT NULL THEN RAISE EXCEPTION 'Reverse these entries first: %',v; END IF;
  IF TG_TABLE_NAME='trips' AND EXISTS(SELECT 1 FROM public.advances a JOIN public.salary_payments s ON s.driver_id=a.driver_id WHERE a.trip_id=NEW.id AND NOT a.is_cancelled AND NOT s.is_reversed AND s.recovered_advance>0) THEN RAISE EXCEPTION 'Reverse driver salary advance recoveries before cancelling this trip'; END IF;
  NEW.cancelled_by:=auth.uid(); NEW.cancelled_at:=now();
 END IF; RETURN NEW;
END $$;
CREATE TRIGGER ba_removal_guard BEFORE INSERT OR UPDATE ON public.lrs FOR EACH ROW EXECUTE FUNCTION public.document_removal_guard();
CREATE TRIGGER ba_removal_guard BEFORE INSERT OR UPDATE ON public.trips FOR EACH ROW EXECUTE FUNCTION public.document_removal_guard();
CREATE OR REPLACE FUNCTION public.cancel_document_children() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.status='cancelled' AND OLD.status<>'cancelled' THEN
  IF TG_TABLE_NAME='trips' THEN
   UPDATE public.lrs SET status='cancelled',cancel_reason=NEW.cancel_reason WHERE trip_id=NEW.id AND status<>'cancelled';
   UPDATE public.advances SET is_cancelled=true,cancel_reason=NEW.cancel_reason WHERE trip_id=NEW.id AND NOT is_cancelled;
   UPDATE public.expenses SET is_cancelled=true,cancel_reason=NEW.cancel_reason WHERE trip_id=NEW.id AND NOT is_cancelled;
  ELSE UPDATE public.expenses SET is_cancelled=true,cancel_reason=NEW.cancel_reason WHERE lr_id=NEW.id AND NOT is_cancelled; END IF;
 END IF; RETURN NEW;
END $$;
CREATE TRIGGER dz_cancel_children AFTER UPDATE ON public.lrs FOR EACH ROW EXECUTE FUNCTION public.cancel_document_children();
CREATE TRIGGER dz_cancel_children AFTER UPDATE ON public.trips FOR EACH ROW EXECUTE FUNCTION public.cancel_document_children();
CREATE OR REPLACE FUNCTION public.ledger_set(p_business_id uuid,p_account_type text,p_account_id uuid,p_source_table text,p_source_id uuid,p_line_kind text,p_entry_date date,p_description text,p_debit numeric,p_credit numeric) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_inactive boolean:=false; v_reason text; v_line public.ledger_entries;
BEGIN
 IF p_source_table='lrs' THEN SELECT status='cancelled',cancel_reason INTO v_inactive,v_reason FROM public.lrs WHERE id=p_source_id;
 ELSIF p_source_table='expenses' THEN SELECT is_cancelled,cancel_reason INTO v_inactive,v_reason FROM public.expenses WHERE id=p_source_id;
 ELSIF p_source_table='advances' THEN SELECT is_cancelled,cancel_reason INTO v_inactive,v_reason FROM public.advances WHERE id=p_source_id;
 ELSIF p_source_table='payments' THEN SELECT is_reversed,reversal_reason INTO v_inactive,v_reason FROM public.payments WHERE id=p_source_id;
 ELSIF p_source_table='salary_payments' THEN SELECT is_reversed,reversal_reason INTO v_inactive,v_reason FROM public.salary_payments WHERE id=p_source_id; END IF;
 IF coalesce(v_inactive,false) THEN
  SELECT * INTO v_line FROM public.ledger_entries WHERE business_id=p_business_id AND source_table=p_source_table AND source_id=p_source_id AND line_kind=p_line_kind;
  IF v_line.id IS NOT NULL AND (v_line.debit<>0 OR v_line.credit<>0) THEN
   PERFORM public.post_ledger(p_business_id,v_line.account_type,v_line.account_id,p_source_table,p_source_id,p_line_kind||'_reversal',current_date,'Reversal: '||coalesce(v_reason,''),v_line.credit,v_line.debit);
   UPDATE public.ledger_entries SET reversal_of=v_line.id WHERE business_id=p_business_id AND source_table=p_source_table AND source_id=p_source_id AND line_kind=p_line_kind||'_reversal';
  END IF; RETURN;
 END IF;
 IF p_account_id IS NULL OR (coalesce(p_debit,0)=0 AND coalesce(p_credit,0)=0) THEN
  UPDATE public.ledger_entries SET debit=0,credit=0,entry_date=coalesce(p_entry_date,entry_date),description=p_description WHERE business_id=p_business_id AND source_table=p_source_table AND source_id=p_source_id AND line_kind=p_line_kind;
 ELSE PERFORM public.post_ledger(p_business_id,p_account_type,p_account_id,p_source_table,p_source_id,p_line_kind,p_entry_date,p_description,p_debit,p_credit); END IF;
END $$;
CREATE OR REPLACE FUNCTION public.remove_record(p_table text,p_id uuid,p_action text,p_reason text DEFAULT '',p_confirmation text DEFAULT '') RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_biz uuid:=public.current_business_id(); v_row jsonb; v_label text; v_block text; f record; v_used boolean;
BEGIN
 IF auth.uid() IS NULL OR v_biz IS NULL THEN RAISE EXCEPTION 'Sign in with business access required'; END IF;
 IF p_table NOT IN('lrs','trips','parties','drivers','vehicles','routes','payments','salary_payments','salary_entries','transporters') THEN RAISE EXCEPTION 'Unsupported record'; END IF;
 LOCK TABLE public.trips,public.trip_stops,public.lrs,public.lr_parties,public.lr_adjustments,public.expenses,public.advances,public.payments,public.payment_allocations,public.driver_commissions,public.commission_receipts,public.salary_entries,public.salary_payments IN SHARE ROW EXCLUSIVE MODE;
 EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id=$1 AND business_id=$2 FOR UPDATE',p_table) INTO v_row USING p_id,v_biz;
 IF v_row IS NULL THEN RAISE EXCEPTION 'Record not found or access denied'; END IF;
 v_label:=coalesce(v_row->>'lr_number',v_row->>'trip_number',v_row->>'name',v_row->>'registration_number',CASE WHEN p_table='routes' THEN (v_row->>'origin')||' → '||(v_row->>'destination') END,p_id::text);
 IF p_action='delete' THEN
  IF NOT public.has_business_role(v_biz,'owner') THEN RAISE EXCEPTION 'Only an Owner can delete permanently'; END IF;
  IF p_confirmation IS DISTINCT FROM v_label THEN RAISE EXCEPTION 'Type the exact record number/name to confirm'; END IF;
  IF p_table IN('payments','salary_payments','salary_entries') THEN RAISE EXCEPTION 'Money entries cannot be deleted; reverse instead'; END IF;
  IF p_table IN('lrs','trips') THEN
   v_block:=public.removal_blockers(p_table,p_id,true);
   IF v_block IS NOT NULL THEN RAISE EXCEPTION 'Cannot delete: payment history exists: %. Reverse active entries and use Cancel instead.',v_block; END IF;
  END IF;
  IF p_table='lrs' THEN
   IF EXISTS(SELECT 1 FROM public.advances WHERE trip_id=(v_row->>'trip_id')::uuid AND trip_id IS NOT NULL) THEN RAISE EXCEPTION 'Linked trip has advance history. Use Cancel instead.'; END IF;
   DELETE FROM public.ledger_entries WHERE business_id=v_biz AND ((source_table='lrs' AND source_id=p_id) OR (source_table='expenses' AND source_id IN(SELECT id FROM public.expenses WHERE lr_id=p_id)) OR (source_table='driver_commissions' AND source_id IN(SELECT id FROM public.driver_commissions WHERE lr_id=p_id))) AND reversal_of IS NOT NULL;
   DELETE FROM public.ledger_entries WHERE business_id=v_biz AND ((source_table='lrs' AND source_id=p_id) OR (source_table='expenses' AND source_id IN(SELECT id FROM public.expenses WHERE lr_id=p_id)) OR (source_table='driver_commissions' AND source_id IN(SELECT id FROM public.driver_commissions WHERE lr_id=p_id)));
   DELETE FROM public.expenses WHERE business_id=v_biz AND lr_id=p_id;
   DELETE FROM public.driver_commissions WHERE business_id=v_biz AND lr_id=p_id;
  ELSIF p_table='trips' THEN
   IF EXISTS(SELECT 1 FROM public.lrs WHERE trip_id=p_id) OR EXISTS(SELECT 1 FROM public.expenses WHERE trip_id=p_id) OR EXISTS(SELECT 1 FROM public.advances WHERE trip_id=p_id) OR EXISTS(SELECT 1 FROM public.trips WHERE parent_trip_id=p_id) THEN RAISE EXCEPTION 'Trip has linked LRs, expenses, advances or child trips. Keep it and use Cancel instead.'; END IF;
   DELETE FROM public.ledger_entries WHERE business_id=v_biz AND source_table='driver_commissions' AND source_id IN(SELECT id FROM public.driver_commissions WHERE trip_id=p_id) AND reversal_of IS NOT NULL;
   DELETE FROM public.ledger_entries WHERE business_id=v_biz AND source_table='driver_commissions' AND source_id IN(SELECT id FROM public.driver_commissions WHERE trip_id=p_id);
   DELETE FROM public.driver_commissions WHERE business_id=v_biz AND trip_id=p_id;
  ELSE
   IF EXISTS(SELECT 1 FROM public.ledger_entries WHERE business_id=v_biz AND account_id=p_id) THEN RAISE EXCEPTION 'Transaction history exists. Archive instead.'; END IF;
   FOR f IN SELECT c.conrelid::regclass AS child,a.attname AS col FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=ANY(c.conkey) WHERE c.contype='f' AND c.confrelid=format('public.%I',p_table)::regclass LOOP
    EXECUTE format('SELECT EXISTS(SELECT 1 FROM %s WHERE %I=$1)',f.child,f.col) INTO v_used USING p_id;
    IF v_used THEN RAISE EXCEPTION 'Used in % (%). Archive instead.',f.child,f.col; END IF;
   END LOOP;
  END IF;
  INSERT INTO public.audit_logs(business_id,table_name,record_id,action,old_data,user_id) VALUES(v_biz,p_table,p_id,'DELETE_PERMANENTLY',v_row,auth.uid());
  EXECUTE format('DELETE FROM public.%I WHERE id=$1 AND business_id=$2',p_table) USING p_id,v_biz;
  IF p_table='lrs' AND nullif(v_row->>'trip_id','') IS NOT NULL THEN UPDATE public.trips SET commission_value=commission_value WHERE id=(v_row->>'trip_id')::uuid AND business_id=v_biz AND commission_enabled AND commission_mode='percent'; END IF;
 ELSIF p_action='cancel' AND p_table IN('lrs','trips') THEN
  IF nullif(trim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'Cancellation reason required'; END IF;
  EXECUTE format('UPDATE public.%I SET status=''cancelled'',cancel_reason=$3 WHERE id=$1 AND business_id=$2 AND status<>''cancelled''',p_table) USING p_id,v_biz,trim(p_reason);
 ELSIF p_action='reverse' AND p_table IN('payments','salary_payments') THEN
  IF nullif(trim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'Reversal reason required'; END IF;
  EXECUTE format('UPDATE public.%I SET is_reversed=true,reversal_reason=$3 WHERE id=$1 AND business_id=$2 AND NOT is_reversed',p_table) USING p_id,v_biz,trim(p_reason);
 ELSIF p_action IN('archive','restore') AND p_table IN('parties','drivers','vehicles','routes','transporters') THEN
  EXECUTE format('UPDATE public.%I SET is_active=$3 WHERE id=$1 AND business_id=$2',p_table) USING p_id,v_biz,p_action='restore';
 ELSE RAISE EXCEPTION 'This action is not allowed for this record'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.remove_record(text,uuid,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.remove_record(text,uuid,text,text,text) TO authenticated;