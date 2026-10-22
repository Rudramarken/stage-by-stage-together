CREATE OR REPLACE FUNCTION public.refresh_trip_commission() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.trip_id IS NOT NULL THEN UPDATE public.trips SET commission_value=commission_value WHERE id=NEW.trip_id AND business_id=NEW.business_id AND commission_enabled AND commission_mode='percent'; END IF;
 IF TG_OP='UPDATE' THEN IF OLD.trip_id IS DISTINCT FROM NEW.trip_id AND OLD.trip_id IS NOT NULL THEN UPDATE public.trips SET commission_value=commission_value WHERE id=OLD.trip_id AND business_id=OLD.business_id AND commission_enabled AND commission_mode='percent'; END IF; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER zz_refresh_trip_commission AFTER INSERT OR UPDATE ON public.lrs FOR EACH ROW EXECUTE FUNCTION public.refresh_trip_commission();