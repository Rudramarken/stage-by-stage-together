CREATE OR REPLACE FUNCTION public.get_or_create_transporter_for_party(p_party_id uuid)
RETURNS uuid LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE v_id uuid; v_biz uuid := public.current_business_id(); v_name text;
BEGIN
  IF v_biz IS NULL THEN RAISE EXCEPTION 'No business found for the signed-in user'; END IF;
  SELECT name INTO v_name FROM public.parties WHERE id = p_party_id AND business_id = v_biz;
  IF v_name IS NULL THEN RAISE EXCEPTION 'Party not found'; END IF;
  SELECT id INTO v_id FROM public.transporters WHERE business_id = v_biz AND party_id = p_party_id LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  v_id := public.get_or_create_transporter(v_name);
  UPDATE public.transporters SET party_id = p_party_id WHERE id = v_id AND business_id = v_biz AND party_id IS NULL;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.get_or_create_transporter_for_party(uuid) TO authenticated;