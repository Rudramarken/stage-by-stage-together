-- Client changes (transporter add / shortage + clearer direct-payment ledger line).
-- Backward-compatible: only adds 4 nullable columns to lrs and changes ONE text label inside lr_after().
-- No ledger amount, existing row, table, policy or other function is changed.

-- 1) Add (+) and Shortage (-) on the freight payable to the transporter.
--    freight_payable stays the single final amount used by ledgers, settlements and reports; these columns only
--    remember what was added / cut (and why) so the LR can be re-opened and edited. Existing rows keep NULL.
ALTER TABLE public.lrs ADD COLUMN IF NOT EXISTS transporter_additions numeric(14,2);
ALTER TABLE public.lrs ADD COLUMN IF NOT EXISTS transporter_additions_reason text;
ALTER TABLE public.lrs ADD COLUMN IF NOT EXISTS transporter_shortage numeric(14,2);
ALTER TABLE public.lrs ADD COLUMN IF NOT EXISTS transporter_shortage_reason text;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lrs_transporter_additions_check') THEN
    ALTER TABLE public.lrs ADD CONSTRAINT lrs_transporter_additions_check CHECK (transporter_additions IS NULL OR transporter_additions >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lrs_transporter_shortage_check') THEN
    ALTER TABLE public.lrs ADD CONSTRAINT lrs_transporter_shortage_check CHECK (transporter_shortage IS NULL OR transporter_shortage >= 0);
  END IF;
END $$;

-- Extend save_lr (the existing, already-patched function) so it also stores the 4 new fields.
-- Only one fragment is added to its final UPDATE; nothing else in the function changes.
-- Safe to re-run: skipped if already applied, and aborts (changing nothing) if the expected fragment is not found.
DO $migration$
DECLARE d text; old_frag text; new_frag text;
BEGIN
  d := pg_get_functiondef('public.save_lr(jsonb)'::regprocedure);
  IF position('transporter_additions' IN d) > 0 THEN RETURN; END IF;
  old_frag := 'freight_payable=coalesce(nullif(p->>''freight_payable'','''')::numeric,0),';
  new_frag := old_frag || 'transporter_additions=nullif(p->>''transporter_additions'','''')::numeric,transporter_additions_reason=CASE WHEN coalesce(nullif(p->>''transporter_additions'','''')::numeric,0)>0 THEN nullif(trim(p->>''transporter_additions_reason''),'''') END,transporter_shortage=nullif(p->>''transporter_shortage'','''')::numeric,transporter_shortage_reason=CASE WHEN coalesce(nullif(p->>''transporter_shortage'','''')::numeric,0)>0 THEN nullif(trim(p->>''transporter_shortage_reason''),'''') END,';
  IF position(old_frag IN d) = 0 THEN RAISE EXCEPTION 'save_lr definition not in the expected shape; migration aborted without changes'; END IF;
  d := replace(d, old_frag, new_frag);
  EXECUTE d;
END $migration$;

-- 2) Transporter ledger: when the consignee paid more than the freight payable and commission is on, the
--    "Consignee paid driver directly" line now also states the full amount the party paid
--    (e.g. "party paid 21000.00 = freight 19550.00 + commission 1450.00").
--    Identical to the 0003 version of lr_after() EXCEPT the description text of that one line.
--    Debit/credit amounts are unchanged, so balances, Transporter Settlements and Outstanding do not move.
--    Existing LRs show the new text the next time they are saved.
CREATE OR REPLACE FUNCTION public.lr_after() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_bp uuid; v_active boolean := NEW.status <> 'cancelled'; v_dp numeric; v_label text := 'LR ' || NEW.lr_number; v_exc numeric := 0;
BEGIN
 v_bp := public.lr_billing_party(NEW);
 PERFORM public.ledger_set(NEW.business_id,'party',v_bp,'lrs',NEW.id,'freight',NEW.lr_date,'Freight '||v_label,CASE WHEN v_active THEN NEW.final_freight ELSE 0 END,0);
 v_dp:=CASE WHEN v_active AND NEW.direct_payment_enabled THEN least(NEW.direct_payment_amount,NEW.final_freight) ELSE 0 END;
 PERFORM public.ledger_set(NEW.business_id,'party',v_bp,'lrs',NEW.id,'direct_payment',NEW.lr_date,'Paid driver directly ('||v_label||')',0,v_dp);
 PERFORM public.ledger_set(NEW.business_id,'transporter',NEW.transporter_id,'lrs',NEW.id,'freight_payable',NEW.lr_date,'Freight payable '||v_label,0,CASE WHEN v_active THEN NEW.freight_payable ELSE 0 END);
 IF v_active AND NEW.commission_enabled AND v_dp > NEW.freight_payable THEN v_exc := least(coalesce(NEW.commission_amount,0), v_dp - NEW.freight_payable); END IF;
 PERFORM public.ledger_set(NEW.business_id,'transporter',NEW.transporter_id,'lrs',NEW.id,'direct_payment_transporter',NEW.lr_date,'Consignee paid driver directly ('||v_label||')'||CASE WHEN v_exc>0 THEN ' - party paid '||trim(to_char(v_dp,'FM999999999990.00'))||' = freight '||trim(to_char(NEW.freight_payable,'FM999999999990.00'))||' + commission '||trim(to_char(v_exc,'FM999999999990.00')) ELSE '' END,CASE WHEN v_active THEN least(v_dp,NEW.freight_payable) ELSE 0 END,0);
 RETURN NEW;
END $$;
