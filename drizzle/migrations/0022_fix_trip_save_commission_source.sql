DO $migration$
DECLARE d text; old_frag text; new_frag text;
BEGIN
  d := pg_get_functiondef('public.commission_source_before()'::regprocedure);
  old_frag := 'IF TG_TABLE_NAME=''lrs'' AND v_t IS NULL AND NEW.trip_id IS NOT NULL THEN v_t:=v_trip.transporter_id; END IF;';
  new_frag := 'IF TG_TABLE_NAME=''lrs'' AND v_t IS NULL THEN IF v_trip.id IS NOT NULL THEN v_t:=v_trip.transporter_id; END IF; END IF;';
  IF position(new_frag IN d) > 0 THEN RETURN; END IF;
  IF position(old_frag IN d) = 0 THEN RAISE EXCEPTION 'commission_source_before not in the expected shape; nothing changed'; END IF;
  EXECUTE replace(d, old_frag, new_frag);
END $migration$;