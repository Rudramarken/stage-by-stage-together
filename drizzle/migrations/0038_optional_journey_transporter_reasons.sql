ALTER TABLE public.trip_journey_entries ADD COLUMN IF NOT EXISTS shortage_reason text;
ALTER TABLE public.trip_journey_entries ADD COLUMN IF NOT EXISTS addition_reason text;
DO $migration$
DECLARE definition text; updated text;
BEGIN
SELECT pg_get_functiondef('public.save_trip_journeys(jsonb)'::regprocedure) INTO definition;
updated := replace(definition,'delivery_point,expenses)','delivery_point,expenses,shortage_reason,addition_reason)');
updated := replace(updated,'coalesce(r->''expenses'',''[]''::jsonb))','coalesce(r->''expenses'',''[]''::jsonb),nullif(trim(r->>''shortage_reason''),''''),nullif(trim(r->>''addition_reason''),''''))');
updated := replace(updated,'expenses=excluded.expenses;','expenses=excluded.expenses,shortage_reason=excluded.shortage_reason,addition_reason=excluded.addition_reason;');
IF updated = definition OR position('shortage_reason=excluded.shortage_reason' in updated)=0 OR position('nullif(trim(r->>''shortage_reason'')' in updated)=0 THEN RAISE EXCEPTION 'Journey save definition did not match expected structure'; END IF;
EXECUTE updated;
END $migration$;
GRANT EXECUTE ON FUNCTION public.save_trip_journeys(jsonb) TO authenticated,service_role;
REVOKE EXECUTE ON FUNCTION public.save_trip_journeys(jsonb) FROM PUBLIC,anon;