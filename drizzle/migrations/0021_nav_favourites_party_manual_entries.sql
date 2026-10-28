CREATE TABLE IF NOT EXISTS public.user_nav_favourites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  nav_key text NOT NULL CHECK (nav_key ~ '^/[a-z0-9-]+$' AND length(nav_key) <= 64),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, nav_key)
);
CREATE INDEX IF NOT EXISTS user_nav_favourites_user ON public.user_nav_favourites(user_id);
GRANT SELECT, INSERT, DELETE ON public.user_nav_favourites TO authenticated;
GRANT ALL ON public.user_nav_favourites TO service_role;
ALTER TABLE public.user_nav_favourites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own select" ON public.user_nav_favourites;
CREATE POLICY "own select" ON public.user_nav_favourites FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND public.is_business_member(business_id));
DROP POLICY IF EXISTS "own insert" ON public.user_nav_favourites;
CREATE POLICY "own insert" ON public.user_nav_favourites FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_business_member(business_id));
DROP POLICY IF EXISTS "own delete" ON public.user_nav_favourites;
CREATE POLICY "own delete" ON public.user_nav_favourites FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND public.is_business_member(business_id));
DROP TRIGGER IF EXISTS a_stamp_business ON public.user_nav_favourites;
CREATE TRIGGER a_stamp_business BEFORE INSERT OR UPDATE ON public.user_nav_favourites
  FOR EACH ROW EXECUTE FUNCTION public.stamp_business_id();

CREATE TABLE IF NOT EXISTS public.party_manual_entries (
  id uuid PRIMARY KEY,
  business_id uuid NOT NULL REFERENCES public.businesses(id),
  party_id uuid NOT NULL REFERENCES public.parties(id),
  entry_date date NOT NULL,
  entry_side text NOT NULL CHECK (entry_side IN ('debit','credit')),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  reference text,
  notes text NOT NULL CHECK (length(trim(notes)) >= 3),
  is_reversed boolean NOT NULL DEFAULT false,
  reversal_reason text,
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS party_manual_entries_idx ON public.party_manual_entries(business_id, party_id, entry_date);
GRANT SELECT ON public.party_manual_entries TO authenticated;
GRANT ALL ON public.party_manual_entries TO service_role;
ALTER TABLE public.party_manual_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "members read party manual entries" ON public.party_manual_entries;
CREATE POLICY "members read party manual entries" ON public.party_manual_entries FOR SELECT TO authenticated USING (public.is_business_member(business_id));
DROP TRIGGER IF EXISTS z_audit ON public.party_manual_entries;
CREATE TRIGGER z_audit AFTER INSERT OR UPDATE OR DELETE ON public.party_manual_entries FOR EACH ROW EXECUTE FUNCTION public.write_audit();

CREATE OR REPLACE FUNCTION public.party_manual_after() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_d numeric := CASE WHEN NEW.entry_side='debit' THEN NEW.amount ELSE 0 END;
        v_c numeric := CASE WHEN NEW.entry_side='credit' THEN NEW.amount ELSE 0 END; v_orig uuid;
BEGIN
  PERFORM public.post_ledger(NEW.business_id,'party',NEW.party_id,'party_manual_entries',NEW.id,'manual',NEW.entry_date,
    'Manual ' || NEW.entry_side || ' entry' || coalesce(' · ' || NEW.reference,'') || ' · ' || NEW.notes, v_d, v_c);
  IF NEW.is_reversed THEN
    PERFORM public.post_ledger(NEW.business_id,'party',NEW.party_id,'party_manual_entries',NEW.id,'manual_reversal',
      (now() AT TIME ZONE 'Asia/Kolkata')::date,'Reversal of manual ' || NEW.entry_side || ' entry: ' || coalesce(NEW.reversal_reason,''), v_c, v_d);
    SELECT id INTO v_orig FROM public.ledger_entries WHERE source_table='party_manual_entries' AND source_id=NEW.id AND line_kind='manual';
    UPDATE public.ledger_entries SET reversal_of=v_orig WHERE source_table='party_manual_entries' AND source_id=NEW.id AND line_kind='manual_reversal';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS c_party_manual ON public.party_manual_entries;
CREATE TRIGGER c_party_manual AFTER INSERT OR UPDATE ON public.party_manual_entries FOR EACH ROW EXECUTE FUNCTION public.party_manual_after();

CREATE OR REPLACE FUNCTION public.save_party_manual_entry(p_id uuid, p_party_id uuid, p_date date, p_side text, p_amount numeric, p_reference text, p_notes text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_biz uuid := public.current_business_id(); v_old public.party_manual_entries;
BEGIN
  IF auth.uid() IS NULL OR v_biz IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF NOT (public.has_business_role(v_biz,'owner') OR public.has_business_role(v_biz,'admin')) THEN RAISE EXCEPTION 'Only an owner or admin can add manual ledger entries'; END IF;
  IF p_id IS NULL THEN RAISE EXCEPTION 'Entry id is required'; END IF;
  IF p_side IS NULL OR p_side NOT IN ('debit','credit') THEN RAISE EXCEPTION 'Choose Debit or Credit'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Amount must be greater than 0'; END IF;
  IF round(p_amount,2) <> p_amount THEN RAISE EXCEPTION 'Amount can have at most 2 decimal places'; END IF;
  IF p_date IS NULL THEN RAISE EXCEPTION 'Date is required'; END IF;
  IF length(trim(coalesce(p_notes,''))) < 3 THEN RAISE EXCEPTION 'Notes / description are required (at least 3 characters)'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.parties WHERE id=p_party_id AND business_id=v_biz) THEN RAISE EXCEPTION 'Party not found'; END IF;
  SELECT * INTO v_old FROM public.party_manual_entries WHERE id=p_id FOR UPDATE;
  IF v_old.id IS NOT NULL THEN
    IF v_old.business_id <> v_biz THEN RAISE EXCEPTION 'Entry not found'; END IF;
    IF v_old.party_id <> p_party_id THEN RAISE EXCEPTION 'An entry cannot be moved to another party; reverse it and add a new one'; END IF;
    IF v_old.is_reversed THEN RAISE EXCEPTION 'This entry is reversed and can no longer be edited'; END IF;
    UPDATE public.party_manual_entries SET entry_date=p_date, entry_side=p_side, amount=p_amount,
      reference=nullif(trim(p_reference),''), notes=trim(p_notes), updated_at=now() WHERE id=p_id;
  ELSE
    INSERT INTO public.party_manual_entries(id,business_id,party_id,entry_date,entry_side,amount,reference,notes,created_by)
    VALUES (p_id,v_biz,p_party_id,p_date,p_side,p_amount,nullif(trim(p_reference),''),trim(p_notes),auth.uid());
  END IF;
  RETURN p_id;
END $$;
REVOKE ALL ON FUNCTION public.save_party_manual_entry(uuid,uuid,date,text,numeric,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_party_manual_entry(uuid,uuid,date,text,numeric,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.reverse_party_manual_entry(p_id uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_biz uuid := public.current_business_id();
BEGIN
  IF auth.uid() IS NULL OR v_biz IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF NOT (public.has_business_role(v_biz,'owner') OR public.has_business_role(v_biz,'admin')) THEN RAISE EXCEPTION 'Only an owner or admin can reverse manual ledger entries'; END IF;
  IF length(trim(coalesce(p_reason,''))) < 3 THEN RAISE EXCEPTION 'A reason is required'; END IF;
  UPDATE public.party_manual_entries SET is_reversed=true, reversal_reason=trim(p_reason), updated_at=now()
   WHERE id=p_id AND business_id=v_biz AND NOT is_reversed;
  IF NOT FOUND THEN RAISE EXCEPTION 'Entry not found or already reversed'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.reverse_party_manual_entry(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reverse_party_manual_entry(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_party_opening(p_party_id uuid, p_type text, p_amount numeric, p_date date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_biz uuid := public.current_business_id();
BEGIN
  IF auth.uid() IS NULL OR v_biz IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF NOT (public.has_business_role(v_biz,'owner') OR public.has_business_role(v_biz,'admin')) THEN RAISE EXCEPTION 'Only an owner or admin can change a party opening balance'; END IF;
  IF p_type IS NULL OR p_type NOT IN ('none','receivable','payable') THEN RAISE EXCEPTION 'Invalid opening balance type'; END IF;
  IF p_type <> 'none' AND (p_amount IS NULL OR p_amount <= 0) THEN RAISE EXCEPTION 'Opening balance must be greater than 0'; END IF;
  IF p_type <> 'none' AND round(p_amount,2) <> p_amount THEN RAISE EXCEPTION 'Opening balance can have at most 2 decimal places'; END IF;
  IF p_type <> 'none' AND p_date IS NULL THEN RAISE EXCEPTION 'Opening balance date is required'; END IF;
  UPDATE public.parties SET opening_type=p_type,
         opening_balance=CASE WHEN p_type='none' THEN 0 ELSE p_amount END,
         opening_date=CASE WHEN p_type='none' THEN NULL ELSE p_date END, updated_at=now()
   WHERE id=p_party_id AND business_id=v_biz;
  IF NOT FOUND THEN RAISE EXCEPTION 'Party not found'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.set_party_opening(uuid,text,numeric,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_party_opening(uuid,text,numeric,date) TO authenticated;

NOTIFY pgrst, 'reload schema';