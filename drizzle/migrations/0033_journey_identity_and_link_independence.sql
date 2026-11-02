CREATE OR REPLACE FUNCTION public.journey_business_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN IF TG_OP='UPDATE' AND NEW.business_id IS DISTINCT FROM OLD.business_id THEN RAISE EXCEPTION 'Journey business cannot be changed'; END IF; RETURN NEW; END $$;
CREATE TRIGGER a_identity_business BEFORE UPDATE ON public.trip_journey_entries FOR EACH ROW EXECUTE FUNCTION public.journey_business_guard();
DO $$ DECLARE d text; BEGIN
 SELECT pg_get_functiondef('public.commission_source_before()'::regprocedure) INTO d;
 d:=replace(d,'IF coalesce(trim(NEW.driver_name),'''')='''' AND NEW.driver_id IS NULL THEN NEW.driver_id:=v_trip.driver_id; NEW.driver_name:=v_trip.driver_name; END IF;','/* Explicit LR linking never copies the trip driver into independent LR fields. */');
 d:=replace(d,'SELECT coalesce(sum(final_freight),0) INTO v_freight FROM public.lrs WHERE trip_id=NEW.id AND status=''active'';','SELECT coalesce(sum(final_freight),0) INTO v_freight FROM public.lrs WHERE trip_id=NEW.id AND status=''active''; SELECT v_freight+coalesce(sum(freight_amount),0) INTO v_freight FROM public.trip_journey_entries WHERE trip_id=NEW.id AND business_id=NEW.business_id AND NOT is_cancelled;');
 EXECUTE d;
END $$;
CREATE OR REPLACE FUNCTION public.refresh_journey_commission() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN UPDATE public.trips SET commission_value=commission_value WHERE id=NEW.trip_id AND business_id=NEW.business_id AND commission_enabled AND commission_mode='percent' AND status<>'cancelled'; RETURN NEW; END $$;
CREATE TRIGGER d_refresh_commission AFTER INSERT OR UPDATE ON public.trip_journey_entries FOR EACH ROW EXECUTE FUNCTION public.refresh_journey_commission();
REVOKE ALL ON FUNCTION public.journey_business_guard(),public.refresh_journey_commission() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.journey_business_guard(),public.refresh_journey_commission() TO authenticated,service_role;
NOTIFY pgrst,'reload schema';