ALTER TABLE public.transporters ADD COLUMN IF NOT EXISTS opening_balance numeric(14,2) NOT NULL DEFAULT 0;
ALTER TABLE public.transporters ADD COLUMN IF NOT EXISTS opening_type text NOT NULL DEFAULT 'none';
ALTER TABLE public.transporters ADD COLUMN IF NOT EXISTS opening_date date;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transporters_opening_check') THEN
    ALTER TABLE public.transporters ADD CONSTRAINT transporters_opening_check CHECK (
      opening_type IN ('none','payable','receivable') AND opening_balance >= 0 AND
      ((opening_type = 'none' AND opening_balance = 0) OR (opening_type <> 'none' AND opening_balance > 0 AND opening_date IS NOT NULL)));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.transporter_opening_ledger() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.opening_type = 'none' OR NEW.opening_balance = 0 THEN
    UPDATE public.ledger_entries SET debit=0, credit=0, description='Opening balance (cleared)'
     WHERE source_table='transporters' AND source_id=NEW.id AND line_kind='opening_balance';
  ELSE
    PERFORM public.post_ledger(NEW.business_id,'transporter',NEW.id,'transporters',NEW.id,'opening_balance',NEW.opening_date,
      'Opening balance (' || CASE WHEN NEW.opening_type='payable' THEN 'payable to transporter' ELSE 'receivable from transporter' END || ')',
      CASE WHEN NEW.opening_type='receivable' THEN NEW.opening_balance ELSE 0 END,
      CASE WHEN NEW.opening_type='payable' THEN NEW.opening_balance ELSE 0 END);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS c_transporter_opening ON public.transporters;
CREATE TRIGGER c_transporter_opening AFTER INSERT OR UPDATE OF opening_balance, opening_type, opening_date ON public.transporters
FOR EACH ROW EXECUTE FUNCTION public.transporter_opening_ledger();

CREATE OR REPLACE FUNCTION public.set_transporter_opening(p_transporter_id uuid, p_type text, p_amount numeric, p_date date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_biz uuid := public.current_business_id();
BEGIN
  IF auth.uid() IS NULL OR v_biz IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF NOT (public.has_business_role(v_biz,'owner') OR public.has_business_role(v_biz,'admin')) THEN RAISE EXCEPTION 'Only an owner or admin can change a transporter opening balance'; END IF;
  IF p_type NOT IN ('none','payable','receivable') THEN RAISE EXCEPTION 'Invalid opening balance type'; END IF;
  IF p_type <> 'none' AND (p_amount IS NULL OR p_amount <= 0) THEN RAISE EXCEPTION 'Opening balance must be greater than 0'; END IF;
  IF p_type <> 'none' AND p_date IS NULL THEN RAISE EXCEPTION 'Opening balance date is required'; END IF;
  UPDATE public.transporters SET opening_type=p_type,
         opening_balance=CASE WHEN p_type='none' THEN 0 ELSE round(p_amount,2) END,
         opening_date=CASE WHEN p_type='none' THEN NULL ELSE p_date END, updated_at=now()
   WHERE id=p_transporter_id AND business_id=v_biz;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transporter not found'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.set_transporter_opening(uuid,text,numeric,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_transporter_opening(uuid,text,numeric,date) TO authenticated;

CREATE TABLE IF NOT EXISTS public.transporter_manual_entries (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES public.businesses(id),
  transporter_id uuid NOT NULL REFERENCES public.transporters(id),
  entry_date date NOT NULL,
  direction text NOT NULL CHECK (direction IN ('increase_payable','reduce_payable')),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  reference text,
  notes text NOT NULL CHECK (length(trim(notes)) >= 3),
  is_reversed boolean NOT NULL DEFAULT false,
  reversal_reason text,
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS transporter_manual_entries_idx ON public.transporter_manual_entries(business_id, transporter_id, entry_date);
GRANT SELECT ON public.transporter_manual_entries TO authenticated;
GRANT ALL ON public.transporter_manual_entries TO service_role;
ALTER TABLE public.transporter_manual_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "members read manual entries" ON public.transporter_manual_entries;
CREATE POLICY "members read manual entries" ON public.transporter_manual_entries FOR SELECT TO authenticated USING (public.is_business_member(business_id));
DROP TRIGGER IF EXISTS z_audit ON public.transporter_manual_entries;
CREATE TRIGGER z_audit AFTER INSERT OR UPDATE OR DELETE ON public.transporter_manual_entries FOR EACH ROW EXECUTE FUNCTION public.write_audit();

CREATE OR REPLACE FUNCTION public.transporter_manual_after() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_d numeric := CASE WHEN NEW.direction='reduce_payable' THEN NEW.amount ELSE 0 END;
        v_c numeric := CASE WHEN NEW.direction='increase_payable' THEN NEW.amount ELSE 0 END; v_orig uuid;
BEGIN
  PERFORM public.post_ledger(NEW.business_id,'transporter',NEW.transporter_id,'transporter_manual_entries',NEW.id,'manual',NEW.entry_date,
    'Manual adjustment (' || CASE WHEN NEW.direction='increase_payable' THEN 'payable increased' ELSE 'payable reduced' END || ')' || coalesce(' · ' || NEW.reference,'') || ' · ' || NEW.notes, v_d, v_c);
  IF NEW.is_reversed THEN
    PERFORM public.post_ledger(NEW.business_id,'transporter',NEW.transporter_id,'transporter_manual_entries',NEW.id,'manual_reversal',
      (now() AT TIME ZONE 'Asia/Kolkata')::date,'Reversal: ' || coalesce(NEW.reversal_reason,''), v_c, v_d);
    SELECT id INTO v_orig FROM public.ledger_entries WHERE source_table='transporter_manual_entries' AND source_id=NEW.id AND line_kind='manual';
    UPDATE public.ledger_entries SET reversal_of=v_orig WHERE source_table='transporter_manual_entries' AND source_id=NEW.id AND line_kind='manual_reversal';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS c_transporter_manual ON public.transporter_manual_entries;
CREATE TRIGGER c_transporter_manual AFTER INSERT OR UPDATE ON public.transporter_manual_entries FOR EACH ROW EXECUTE FUNCTION public.transporter_manual_after();

CREATE OR REPLACE FUNCTION public.save_transporter_manual_entry(p_id uuid, p_transporter_id uuid, p_date date, p_direction text, p_amount numeric, p_reference text, p_notes text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_biz uuid := public.current_business_id(); v_old public.transporter_manual_entries;
BEGIN
  IF auth.uid() IS NULL OR v_biz IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF NOT (public.has_business_role(v_biz,'owner') OR public.has_business_role(v_biz,'admin')) THEN RAISE EXCEPTION 'Only an owner or admin can add manual ledger entries'; END IF;
  IF p_id IS NULL THEN RAISE EXCEPTION 'Entry id is required'; END IF;
  IF p_direction NOT IN ('increase_payable','reduce_payable') THEN RAISE EXCEPTION 'Invalid direction'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Amount must be greater than 0'; END IF;
  IF p_date IS NULL THEN RAISE EXCEPTION 'Date is required'; END IF;
  IF length(trim(coalesce(p_notes,''))) < 3 THEN RAISE EXCEPTION 'Notes are required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.transporters WHERE id=p_transporter_id AND business_id=v_biz) THEN RAISE EXCEPTION 'Transporter not found'; END IF;
  SELECT * INTO v_old FROM public.transporter_manual_entries WHERE id=p_id FOR UPDATE;
  IF v_old.id IS NOT NULL THEN
    IF v_old.business_id <> v_biz THEN RAISE EXCEPTION 'Entry not found'; END IF;
    IF v_old.transporter_id <> p_transporter_id THEN RAISE EXCEPTION 'An entry cannot be moved to another transporter; reverse it and add a new one'; END IF;
    IF v_old.is_reversed THEN RAISE EXCEPTION 'This entry is reversed and can no longer be edited'; END IF;
    UPDATE public.transporter_manual_entries SET entry_date=p_date, direction=p_direction, amount=round(p_amount,2),
      reference=nullif(trim(p_reference),''), notes=trim(p_notes), updated_at=now() WHERE id=p_id;
  ELSE
    INSERT INTO public.transporter_manual_entries(id,business_id,transporter_id,entry_date,direction,amount,reference,notes,created_by)
    VALUES (p_id,v_biz,p_transporter_id,p_date,p_direction,round(p_amount,2),nullif(trim(p_reference),''),trim(p_notes),auth.uid());
  END IF;
  RETURN p_id;
END $$;
REVOKE ALL ON FUNCTION public.save_transporter_manual_entry(uuid,uuid,date,text,numeric,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_transporter_manual_entry(uuid,uuid,date,text,numeric,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.reverse_transporter_manual_entry(p_id uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_biz uuid := public.current_business_id();
BEGIN
  IF auth.uid() IS NULL OR v_biz IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF NOT (public.has_business_role(v_biz,'owner') OR public.has_business_role(v_biz,'admin')) THEN RAISE EXCEPTION 'Only an owner or admin can reverse manual ledger entries'; END IF;
  IF length(trim(coalesce(p_reason,''))) < 3 THEN RAISE EXCEPTION 'A reason is required'; END IF;
  UPDATE public.transporter_manual_entries SET is_reversed=true, reversal_reason=trim(p_reason), updated_at=now()
   WHERE id=p_id AND business_id=v_biz AND NOT is_reversed;
  IF NOT FOUND THEN RAISE EXCEPTION 'Entry not found or already reversed'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.reverse_transporter_manual_entry(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reverse_transporter_manual_entry(uuid,text) TO authenticated;