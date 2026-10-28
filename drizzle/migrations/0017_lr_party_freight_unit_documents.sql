DO $$
DECLARE c record;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint
           WHERE conrelid = 'public.lrs'::regclass AND contype = 'c'
             AND pg_get_constraintdef(oid) LIKE 'CHECK ((weight_unit%' AND pg_get_constraintdef(oid) NOT LIKE '%''unit''%' LOOP
    EXECUTE format('ALTER TABLE public.lrs DROP CONSTRAINT %I', c.conname);
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.lrs'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE 'CHECK ((weight_unit%') THEN
    ALTER TABLE public.lrs ADD CONSTRAINT lrs_weight_unit_check CHECK (weight_unit IN ('kg','quintal','tonne','unit'));
  END IF;
  FOR c IN SELECT conname FROM pg_constraint
           WHERE conrelid = 'public.lrs'::regclass AND contype = 'c'
             AND pg_get_constraintdef(oid) LIKE '%transporter_weight_unit%' AND pg_get_constraintdef(oid) NOT LIKE '%''unit''%' LOOP
    EXECUTE format('ALTER TABLE public.lrs DROP CONSTRAINT %I', c.conname);
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.lrs'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%transporter_weight_unit%') THEN
    ALTER TABLE public.lrs ADD CONSTRAINT lrs_transporter_weight_unit_check CHECK (transporter_weight_unit IS NULL OR transporter_weight_unit IN ('kg','quintal','tonne','unit'));
  END IF;
END $$;

ALTER TABLE public.lr_parties ADD COLUMN IF NOT EXISTS freight_amount numeric(14,2);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lr_parties_freight_amount_check') THEN
    ALTER TABLE public.lr_parties ADD CONSTRAINT lr_parties_freight_amount_check CHECK (freight_amount IS NULL OR freight_amount >= 0);
  END IF;
END $$;

DO $migration$
DECLARE d text; old_frag text; new_frag text;
BEGIN
  d := pg_get_functiondef('public.save_lr(jsonb)'::regprocedure);
  IF position('freight_amount' IN d) > 0 THEN RETURN; END IF;
  old_frag := 'delivery_point=nullif(r->>''delivery_point'','''') WHERE id=v_pid;';
  new_frag := 'delivery_point=nullif(r->>''delivery_point'',''''),freight_amount=nullif(r->>''freight_amount'','''')::numeric WHERE id=v_pid;';
  IF position(old_frag IN d) = 0 THEN RAISE EXCEPTION 'save_lr definition not in the expected shape; migration aborted without changes'; END IF;
  d := replace(d, old_frag, new_frag);
  EXECUTE d;
END $migration$;

CREATE OR REPLACE FUNCTION public.lr_after() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_bp uuid; v_active boolean := NEW.status <> 'cancelled'; v_dp numeric; v_label text := 'LR ' || NEW.lr_number; v_exc numeric := 0;
 v_split boolean; v_pr record; v_dp_party uuid; v_keys text[] := '{}';
BEGIN
 v_split := EXISTS (SELECT 1 FROM public.lr_parties WHERE lr_id = NEW.id AND freight_amount IS NOT NULL);
 v_dp:=CASE WHEN v_active AND NEW.direct_payment_enabled THEN least(NEW.direct_payment_amount,NEW.final_freight) ELSE 0 END;
 IF NOT v_split THEN
  v_bp := public.lr_billing_party(NEW);
  PERFORM public.ledger_set(NEW.business_id,'party',v_bp,'lrs',NEW.id,'freight',NEW.lr_date,'Freight '||v_label,CASE WHEN v_active THEN NEW.final_freight ELSE 0 END,0);
  PERFORM public.ledger_set(NEW.business_id,'party',v_bp,'lrs',NEW.id,'direct_payment',NEW.lr_date,'Paid driver directly ('||v_label||')',0,v_dp);
 ELSE
  PERFORM public.ledger_set(NEW.business_id,'party',NULL,'lrs',NEW.id,'freight',NEW.lr_date,'Freight '||v_label,0,0);
  FOR v_pr IN SELECT id, party_id, role, freight_amount FROM public.lr_parties WHERE lr_id = NEW.id AND freight_amount IS NOT NULL ORDER BY seq, created_at LOOP
   v_keys := v_keys || ('freight_p_' || v_pr.id::text);
   PERFORM public.ledger_set(NEW.business_id,'party',v_pr.party_id,'lrs',NEW.id,'freight_p_'||v_pr.id::text,NEW.lr_date,'Freight '||v_label,CASE WHEN v_active THEN v_pr.freight_amount ELSE 0 END,0);
  END LOOP;
  IF v_active THEN
   UPDATE public.ledger_entries SET debit = 0, credit = 0
    WHERE business_id = NEW.business_id AND source_table = 'lrs' AND source_id = NEW.id
      AND line_kind LIKE 'freight\_p\_%' AND line_kind NOT LIKE '%\_reversal' AND NOT (line_kind = ANY (v_keys));
  END IF;
  SELECT party_id INTO v_dp_party FROM public.lr_parties WHERE lr_id = NEW.id AND freight_amount IS NOT NULL AND freight_amount > 0
   ORDER BY (role = 'consignee') DESC, seq, created_at LIMIT 1;
  PERFORM public.ledger_set(NEW.business_id,'party',v_dp_party,'lrs',NEW.id,'direct_payment',NEW.lr_date,'Paid driver directly ('||v_label||')',0,v_dp);
 END IF;
 PERFORM public.ledger_set(NEW.business_id,'transporter',NEW.transporter_id,'lrs',NEW.id,'freight_payable',NEW.lr_date,'Freight payable '||v_label,0,CASE WHEN v_active THEN NEW.freight_payable ELSE 0 END);
 IF v_active AND NEW.commission_enabled AND v_dp > NEW.freight_payable THEN v_exc := least(coalesce(NEW.commission_amount,0), v_dp - NEW.freight_payable); END IF;
 PERFORM public.ledger_set(NEW.business_id,'transporter',NEW.transporter_id,'lrs',NEW.id,'direct_payment_transporter',NEW.lr_date,'Consignee paid driver directly ('||v_label||')'||CASE WHEN v_exc>0 THEN ' - party paid '||trim(to_char(v_dp,'FM999999999990.00'))||' = freight '||trim(to_char(NEW.freight_payable,'FM999999999990.00'))||' + commission '||trim(to_char(v_exc,'FM999999999990.00')) ELSE '' END,CASE WHEN v_active THEN least(v_dp,NEW.freight_payable) ELSE 0 END,0);
 RETURN NEW;
END $$;

CREATE TABLE IF NOT EXISTS public.lr_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id),
  lr_id uuid NOT NULL REFERENCES public.lrs(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  storage_path text NOT NULL UNIQUE,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lr_documents_lr ON public.lr_documents(lr_id);
GRANT SELECT, INSERT, DELETE ON public.lr_documents TO authenticated;
GRANT ALL ON public.lr_documents TO service_role;
ALTER TABLE public.lr_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "members select" ON public.lr_documents;
CREATE POLICY "members select" ON public.lr_documents FOR SELECT TO authenticated USING (public.is_business_member(business_id));
DROP POLICY IF EXISTS "members insert" ON public.lr_documents;
CREATE POLICY "members insert" ON public.lr_documents FOR INSERT TO authenticated WITH CHECK (public.is_business_member(business_id));
DROP POLICY IF EXISTS "members delete" ON public.lr_documents;
CREATE POLICY "members delete" ON public.lr_documents FOR DELETE TO authenticated USING (public.is_business_member(business_id));
DROP TRIGGER IF EXISTS a_stamp_business ON public.lr_documents;
CREATE TRIGGER a_stamp_business BEFORE INSERT OR UPDATE ON public.lr_documents FOR EACH ROW EXECUTE FUNCTION public.stamp_business_id();
DROP TRIGGER IF EXISTS z_audit ON public.lr_documents;
CREATE TRIGGER z_audit AFTER INSERT OR UPDATE OR DELETE ON public.lr_documents FOR EACH ROW EXECUTE FUNCTION public.write_audit();

DROP POLICY IF EXISTS "lr docs select" ON storage.objects;
CREATE POLICY "lr docs select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'lr-documents' AND public.is_business_member(((storage.foldername(name))[1])::uuid));
DROP POLICY IF EXISTS "lr docs insert" ON storage.objects;
CREATE POLICY "lr docs insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'lr-documents' AND public.is_business_member(((storage.foldername(name))[1])::uuid));
DROP POLICY IF EXISTS "lr docs delete" ON storage.objects;
CREATE POLICY "lr docs delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'lr-documents' AND public.is_business_member(((storage.foldername(name))[1])::uuid));