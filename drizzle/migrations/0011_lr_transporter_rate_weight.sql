-- Backward-compatible: adds 4 nullable columns to lrs so the LR form can remember the rate and weight
-- on which freight is payable to the transporter. Existing rows keep NULL (behave exactly as before);
-- freight_payable remains the single source of truth for ledgers, settlements and reports.
ALTER TABLE public.lrs ADD COLUMN IF NOT EXISTS transporter_rate numeric(14,2);
ALTER TABLE public.lrs ADD COLUMN IF NOT EXISTS transporter_rate_unit text;
ALTER TABLE public.lrs ADD COLUMN IF NOT EXISTS transporter_weight numeric(14,3);
ALTER TABLE public.lrs ADD COLUMN IF NOT EXISTS transporter_weight_unit text;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lrs_transporter_rate_unit_check') THEN
    ALTER TABLE public.lrs ADD CONSTRAINT lrs_transporter_rate_unit_check CHECK (transporter_rate_unit IS NULL OR transporter_rate_unit IN ('per_kg','per_quintal','per_tonne','fixed'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lrs_transporter_weight_unit_check') THEN
    ALTER TABLE public.lrs ADD CONSTRAINT lrs_transporter_weight_unit_check CHECK (transporter_weight_unit IS NULL OR transporter_weight_unit IN ('kg','quintal','tonne'));
  END IF;
END $$;

-- Extend save_lr (the existing, already-patched function) so it also stores the 4 new fields.
-- Only one fragment is added to its final UPDATE; nothing else in the function changes.
-- Safe to re-run: skipped if already applied, and aborts (changing nothing) if the expected fragment is not found.
DO $migration$
DECLARE d text; old_frag text; new_frag text;
BEGIN
  d := pg_get_functiondef('public.save_lr(jsonb)'::regprocedure);
  IF position('transporter_rate_unit' IN d) > 0 THEN RETURN; END IF;
  old_frag := 'freight_payable=coalesce(nullif(p->>''freight_payable'','''')::numeric,0),';
  new_frag := old_frag || 'transporter_rate_unit=nullif(p->>''transporter_rate_unit'',''''),transporter_rate=CASE WHEN nullif(p->>''transporter_rate_unit'','''') IS NULL THEN NULL ELSE nullif(p->>''transporter_rate'','''')::numeric END,transporter_weight=CASE WHEN nullif(p->>''transporter_rate_unit'','''') IS NULL OR p->>''transporter_rate_unit''=''fixed'' THEN NULL ELSE nullif(p->>''transporter_weight'','''')::numeric END,transporter_weight_unit=CASE WHEN nullif(p->>''transporter_rate_unit'','''') IS NULL OR p->>''transporter_rate_unit''=''fixed'' THEN NULL ELSE coalesce(nullif(p->>''transporter_weight_unit'',''''),''kg'') END,';
  IF position(old_frag IN d) = 0 THEN RAISE EXCEPTION 'save_lr definition not in the expected shape; migration aborted without changes'; END IF;
  d := replace(d, old_frag, new_frag);
  EXECUTE d;
END $migration$;
