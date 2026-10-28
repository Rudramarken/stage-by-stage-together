DO $migration$
DECLARE d text; old text;
BEGIN
 SELECT pg_get_functiondef('public.save_lr(jsonb)'::regprocedure) INTO d;
 old := 'transporter_rate=CASE WHEN nullif(p->>''transporter_rate_unit'','''') IS NULL THEN NULL ELSE nullif(p->>''transporter_rate'','''')::numeric END,transporter_weight=CASE WHEN nullif(p->>''transporter_rate_unit'','''') IS NULL OR p->>''transporter_rate_unit''=''fixed'' THEN NULL ELSE nullif(p->>''transporter_weight'','''')::numeric END,transporter_weight_unit=CASE WHEN nullif(p->>''transporter_rate_unit'','''') IS NULL OR p->>''transporter_rate_unit''=''fixed'' THEN NULL ELSE coalesce(nullif(p->>''transporter_weight_unit'',''''),''kg'') END';
 IF position(old IN d)=0 THEN RAISE EXCEPTION 'save_lr transporter update differs; stopped without changes'; END IF;
 d:=replace(d,old,'transporter_rate=nullif(p->>''transporter_rate'','''')::numeric,transporter_weight=nullif(p->>''transporter_weight'','''')::numeric,transporter_weight_unit=CASE WHEN nullif(p->>''transporter_weight'','''') IS NULL THEN NULL ELSE coalesce(nullif(p->>''transporter_weight_unit'',''''),''kg'') END');
 EXECUTE d;
END $migration$;
REVOKE EXECUTE ON FUNCTION public.save_lr(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_lr(jsonb) TO authenticated,service_role;