-- Backward-compatible: only replaces two functions and (conditionally) adds one partial unique index.
-- No tables, columns or rows are dropped, reset or rewritten (other than linking an existing unlinked
-- transporter to the party with the same normalised name when that party is explicitly selected/typed).

CREATE OR REPLACE FUNCTION public.get_or_create_transporter_for_party(p_party_id uuid)
RETURNS uuid LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE v_id uuid; v_biz uuid := public.current_business_id(); v_name text; v_norm text; v_party uuid;
BEGIN
  IF v_biz IS NULL THEN RAISE EXCEPTION 'No business found for the signed-in user'; END IF;
  SELECT name, name_normalized INTO v_name, v_norm FROM public.parties WHERE id = p_party_id AND business_id = v_biz;
  IF v_name IS NULL THEN RAISE EXCEPTION 'Party not found'; END IF;
  SELECT id INTO v_id FROM public.transporters WHERE business_id = v_biz AND party_id = p_party_id ORDER BY created_at LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  SELECT id, party_id INTO v_id, v_party FROM public.transporters WHERE business_id = v_biz AND name_normalized = v_norm;
  IF v_id IS NOT NULL THEN
    IF v_party IS NULL THEN
      UPDATE public.transporters SET party_id = p_party_id WHERE id = v_id AND business_id = v_biz AND party_id IS NULL;
      RETURN v_id;
    END IF;
    RAISE EXCEPTION 'A transporter named "%" already exists and is linked to a different party', v_name;
  END IF;
  INSERT INTO public.transporters(business_id, name, party_id) VALUES (v_biz, v_name, p_party_id)
  ON CONFLICT (business_id, name_normalized) DO NOTHING RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.transporters WHERE business_id = v_biz AND name_normalized = v_norm AND (party_id IS NULL OR party_id = p_party_id);
    IF v_id IS NULL THEN RAISE EXCEPTION 'A transporter named "%" already exists and is linked to a different party', v_name; END IF;
    UPDATE public.transporters SET party_id = p_party_id WHERE id = v_id AND party_id IS NULL;
  END IF;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.get_or_create_transporter_for_party(uuid) TO authenticated;

-- Same signature/behaviour as before, plus: a typed name that matches an existing party (ignoring case and
-- extra spaces) is linked to that party's real ID instead of becoming an unlinked duplicate.
CREATE OR REPLACE FUNCTION public.get_or_create_transporter(p_name text)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_id uuid; v_biz uuid := public.current_business_id(); v_norm text; v_pid uuid;
BEGIN
  IF v_biz IS NULL THEN RAISE EXCEPTION 'No business found for the signed-in user'; END IF;
  v_norm := lower(regexp_replace(trim(p_name), '\s+', ' ', 'g'));
  IF v_norm = '' THEN RAISE EXCEPTION 'Transporter name is required'; END IF;
  SELECT id INTO v_pid FROM public.parties WHERE business_id = v_biz AND name_normalized = v_norm AND is_active LIMIT 1;
  SELECT id INTO v_id FROM public.transporters WHERE business_id = v_biz AND name_normalized = v_norm;
  IF v_id IS NOT NULL THEN
    IF v_pid IS NOT NULL THEN
      UPDATE public.transporters SET party_id = v_pid
       WHERE id = v_id AND business_id = v_biz AND party_id IS NULL
         AND NOT EXISTS (SELECT 1 FROM public.transporters x WHERE x.business_id = v_biz AND x.party_id = v_pid);
    END IF;
    RETURN v_id;
  END IF;
  INSERT INTO public.transporters(business_id, name, party_id)
  VALUES (v_biz, regexp_replace(trim(p_name), '\s+', ' ', 'g'),
          CASE WHEN v_pid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.transporters x WHERE x.business_id = v_biz AND x.party_id = v_pid) THEN v_pid END)
  ON CONFLICT (business_id, name_normalized) DO NOTHING RETURNING id INTO v_id;
  IF v_id IS NULL THEN SELECT id INTO v_id FROM public.transporters WHERE business_id = v_biz AND name_normalized = v_norm; END IF;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.get_or_create_transporter(text) TO authenticated;

-- One transporter record per party. Skipped (with a notice) if existing data already has duplicates,
-- so the migration can never fail or touch existing rows.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.transporters WHERE party_id IS NOT NULL GROUP BY business_id, party_id HAVING count(*) > 1) THEN
    RAISE NOTICE 'Skipping unique index: duplicate transporters per party already exist; review them manually.';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS transporters_one_per_party ON public.transporters(business_id, party_id) WHERE party_id IS NOT NULL;
  END IF;
END $$;
