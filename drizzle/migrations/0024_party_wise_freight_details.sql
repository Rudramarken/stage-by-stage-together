ALTER TABLE public.lr_parties ADD COLUMN IF NOT EXISTS rate numeric, ADD COLUMN IF NOT EXISTS shortage numeric, ADD COLUMN IF NOT EXISTS addition numeric, ADD COLUMN IF NOT EXISTS freight_date date;
ALTER TABLE public.lrs ADD COLUMN IF NOT EXISTS transporter_freight_date date;
DO $migration$
DECLARE d text; old text;
BEGIN
 SELECT pg_get_functiondef('public.save_lr(jsonb)'::regprocedure) INTO d;
 old := 'freight_amount=nullif(r->>''freight_amount'','''')::numeric WHERE id=v_pid';
 IF position(old IN d)=0 THEN RAISE EXCEPTION 'save_lr party update differs; migration stopped without changes'; END IF;
 d := replace(d,old,'freight_amount=nullif(r->>''freight_amount'','''')::numeric,rate=CASE WHEN r ? ''rate'' THEN nullif(r->>''rate'','''')::numeric ELSE rate END,shortage=CASE WHEN r ? ''shortage'' THEN nullif(r->>''shortage'','''')::numeric ELSE shortage END,addition=CASE WHEN r ? ''addition'' THEN nullif(r->>''addition'','''')::numeric ELSE addition END,freight_date=CASE WHEN r ? ''freight_date'' THEN nullif(r->>''freight_date'','''')::date ELSE freight_date END WHERE id=v_pid');
 old := 'UPDATE public.lrs SET lr_date=';
 IF position(old IN d)=0 THEN RAISE EXCEPTION 'save_lr LR update differs; migration stopped without changes'; END IF;
 d := replace(d,old,'UPDATE public.lrs SET transporter_freight_date=CASE WHEN p ? ''transporter_freight_date'' THEN nullif(p->>''transporter_freight_date'','''')::date ELSE transporter_freight_date END,lr_date=');
 EXECUTE d;
END $migration$;
ALTER TABLE public.lr_parties ADD CONSTRAINT lr_party_freight_details_nonnegative CHECK ((rate IS NULL OR rate>=0) AND (shortage IS NULL OR shortage>=0) AND (addition IS NULL OR addition>=0)) NOT VALID;
ALTER TABLE public.lr_parties VALIDATE CONSTRAINT lr_party_freight_details_nonnegative;
COMMENT ON COLUMN public.lr_parties.rate IS 'Independent party rate; final freight_amount remains explicitly entered under existing party-wise accounting.';
COMMENT ON COLUMN public.lr_parties.shortage IS 'Independent party shortage detail; not a second ledger transaction.';
COMMENT ON COLUMN public.lr_parties.addition IS 'Independent party addition detail; not a second ledger transaction.';
REVOKE EXECUTE ON FUNCTION public.save_lr(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_lr(jsonb) TO authenticated,service_role;