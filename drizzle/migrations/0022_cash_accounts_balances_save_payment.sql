-- Part 4: separate Cash / Cash (Narinder) accounts, account balances from every money source, atomic idempotent save_payment().
-- ADDITIVE. Nothing is dropped except the old "one cash account per business" index, which is replaced by a
-- (business_id, system_key) uniqueness rule. No rows are deleted; payment history is untouched.
-- Run once in the Supabase SQL editor. It is safe to re-run (idempotent).
BEGIN;

-- 1. system_key identifies the two built-in cash accounts. Existing Cash rows become system_key='cash'.
ALTER TABLE public.payment_accounts ADD COLUMN IF NOT EXISTS system_key text;
UPDATE public.payment_accounts SET system_key='cash' WHERE kind='cash' AND system_key IS NULL;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT business_id, display_name FROM public.payment_accounts
           WHERE system_key IS NULL AND lower(btrim(display_name)) IN ('cash','cash (narinder)')
  LOOP
    RAISE EXCEPTION 'Business % has an account named "%" that is not a cash account. Rename it and run again.', r.business_id, r.display_name;
  END LOOP;
END $$;

DROP INDEX IF EXISTS public.one_cash_per_business;
CREATE UNIQUE INDEX IF NOT EXISTS payment_accounts_system_key_uq ON public.payment_accounts(business_id, system_key) WHERE system_key IS NOT NULL;
DO $$ BEGIN
  ALTER TABLE public.payment_accounts ADD CONSTRAINT payment_accounts_cash_has_key CHECK (kind <> 'cash' OR (system_key IS NOT NULL AND system_key IN ('cash','cash_narinder')));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Create "Cash (Narinder)" once per business (never duplicated on re-run).
INSERT INTO public.payment_accounts(business_id, kind, display_name, system_key)
SELECT b.id, 'cash', 'Cash (Narinder)', 'cash_narinder' FROM public.businesses b
WHERE NOT EXISTS (SELECT 1 FROM public.payment_accounts a WHERE a.business_id=b.id AND a.system_key='cash_narinder');

-- 3. Cash accounts are permanent and keep their names. Browser users cannot create cash accounts or set system_key.
CREATE OR REPLACE FUNCTION public.protect_cash_account() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF auth.uid() IS NOT NULL AND (NEW.kind='cash' OR NEW.system_key IS NOT NULL) THEN RAISE EXCEPTION 'Cash accounts are built in and cannot be created here'; END IF;
    RETURN NEW;
  END IF;
  IF OLD.kind='cash' THEN
    IF NEW.kind<>'cash' OR NEW.is_active=false THEN RAISE EXCEPTION 'The Cash accounts are permanent and cannot be deactivated'; END IF;
    IF NEW.system_key IS DISTINCT FROM OLD.system_key THEN RAISE EXCEPTION 'A Cash account key cannot be changed'; END IF;
    IF NEW.display_name IS DISTINCT FROM OLD.display_name THEN RAISE EXCEPTION 'Cash account names are fixed'; END IF;
  ELSIF NEW.kind='cash' OR NEW.system_key IS NOT NULL THEN
    RAISE EXCEPTION 'A bank account cannot be turned into a cash account';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS b_protect_cash ON public.payment_accounts;
CREATE TRIGGER b_protect_cash BEFORE INSERT OR UPDATE ON public.payment_accounts FOR EACH ROW EXECUTE FUNCTION public.protect_cash_account();

-- 4. No two accounts with the same name in one business (prevents accidental duplicate bank accounts).
--    Skipped with a NOTICE if existing data already has duplicate names; fix them and re-run.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.payment_accounts GROUP BY business_id, lower(btrim(display_name)) HAVING count(*)>1) THEN
    RAISE NOTICE 'Duplicate account names exist: unique-name index NOT created. Rename duplicates and re-run.';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS payment_accounts_name_uq ON public.payment_accounts(business_id, lower(btrim(display_name)));
  END IF;
END $$;

-- 5. Only Owners/Admins may add or edit accounts and opening balances (everyone in the business can still read them).
DROP POLICY IF EXISTS "members insert" ON public.payment_accounts;
DROP POLICY IF EXISTS "members update" ON public.payment_accounts;
DROP POLICY IF EXISTS "owners admins insert" ON public.payment_accounts;
DROP POLICY IF EXISTS "owners admins update" ON public.payment_accounts;
CREATE POLICY "owners admins insert" ON public.payment_accounts FOR INSERT TO authenticated
  WITH CHECK (public.has_business_role(business_id,'owner') OR public.has_business_role(business_id,'admin'));
CREATE POLICY "owners admins update" ON public.payment_accounts FOR UPDATE TO authenticated
  USING (public.has_business_role(business_id,'owner') OR public.has_business_role(business_id,'admin'))
  WITH CHECK (public.has_business_role(business_id,'owner') OR public.has_business_role(business_id,'admin'));

-- 6. A payment must use an account of its own business, and a new/changed account must be active.
CREATE OR REPLACE FUNCTION public.payment_account_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a public.payment_accounts;
BEGIN
  IF TG_OP='UPDATE' AND NEW.account_id IS NOT DISTINCT FROM OLD.account_id THEN RETURN NEW; END IF;
  SELECT * INTO a FROM public.payment_accounts WHERE id=NEW.account_id;
  IF NOT FOUND OR a.business_id IS DISTINCT FROM NEW.business_id THEN RAISE EXCEPTION 'Choose Cash, Cash (Narinder) or a saved bank account'; END IF;
  IF NOT a.is_active THEN RAISE EXCEPTION 'Account "%" is inactive. Choose an active account', a.display_name; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS bb_payment_account_guard ON public.payments;
CREATE TRIGGER bb_payment_account_guard BEFORE INSERT OR UPDATE OF account_id ON public.payments FOR EACH ROW EXECUTE FUNCTION public.payment_account_guard();

-- 7. ONE definition of "money moved through an account". Each source row appears exactly once.
--    payments (not reversed) | expenses paid by Gokul with an account | driver/other advances with an account
--    | salary payments (cash part only) | commission CASH receipts (salary recovery moves no cash).
--    Opening balance stays an account field (opening_balance/opening_date); it is not a movement row.
CREATE OR REPLACE VIEW public.account_movements WITH (security_invoker=true) AS
SELECT p.business_id, p.account_id, p.payment_date AS movement_date, p.created_at, 'payments'::text AS source_table, p.id AS source_id,
       p.payment_type AS source_type,
       (CASE WHEN p.payment_type IN ('customer_receipt','advance_received','third_party_receipt') THEN 'in' ELSE 'out' END)::text AS direction,
       p.amount::numeric AS amount, coalesce(p.reference,p.txn_reference) AS reference, p.notes AS description,
       p.party_id, p.transporter_id, NULL::uuid AS driver_id, p.payer_name AS other_name
  FROM public.payments p WHERE NOT p.is_reversed
UNION ALL
SELECT e.business_id, e.account_id, e.expense_date, e.created_at, 'expenses', e.id, 'expense', 'out', e.amount::numeric, e.reference,
       e.category || coalesce(' · '||e.paid_to,''), NULL::uuid, NULL::uuid, NULL::uuid, NULL::text
  FROM public.expenses e WHERE e.account_id IS NOT NULL AND NOT e.is_cancelled AND e.payment_status='paid' AND e.responsible='gokul'
UNION ALL
SELECT a.business_id, a.account_id, a.advance_date, a.created_at, 'advances', a.id, 'advance', 'out', a.amount::numeric, a.reference,
       'Advance paid', a.party_id, a.transporter_id, a.driver_id, a.other_name
  FROM public.advances a WHERE a.account_id IS NOT NULL AND NOT a.is_cancelled
UNION ALL
SELECT s.business_id, s.account_id, s.payment_date, s.created_at, 'salary_payments', s.id, 'salary_payment', 'out', s.amount::numeric, s.reference,
       'Salary paid', NULL::uuid, NULL::uuid, s.driver_id, NULL::text
  FROM public.salary_payments s WHERE s.account_id IS NOT NULL AND NOT s.is_reversed AND s.amount>0
UNION ALL
SELECT c.business_id, c.account_id, c.receipt_date, c.created_at, 'commission_receipts', c.id, 'commission_receipt', 'in', c.amount::numeric, c.reference,
       'Commission received', NULL::uuid, c.transporter_id, c.driver_id, NULL::text
  FROM public.commission_receipts c WHERE c.account_id IS NOT NULL AND c.salary_payment_id IS NULL AND NOT c.is_reversed;
GRANT SELECT ON public.account_movements TO authenticated;

-- 8. Balance per account: opening balance + receipts - payments, counting only movements dated on/after the opening date
--    (and on/before p_as_of when given). Runs with the caller's RLS, so a user only ever sees their own business.
CREATE OR REPLACE FUNCTION public.account_balances_as_of(p_as_of date DEFAULT NULL)
RETURNS TABLE(account_id uuid, opening_balance numeric, opening_date date, receipts numeric, payments numeric, balance numeric, entries_before_opening integer)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
  SELECT a.id, a.opening_balance, a.opening_date,
    coalesce(sum(m.amount) FILTER (WHERE m.direction='in'  AND (a.opening_date IS NULL OR m.movement_date>=a.opening_date) AND (p_as_of IS NULL OR m.movement_date<=p_as_of)),0),
    coalesce(sum(m.amount) FILTER (WHERE m.direction='out' AND (a.opening_date IS NULL OR m.movement_date>=a.opening_date) AND (p_as_of IS NULL OR m.movement_date<=p_as_of)),0),
    a.opening_balance
      + coalesce(sum(m.amount) FILTER (WHERE m.direction='in'  AND (a.opening_date IS NULL OR m.movement_date>=a.opening_date) AND (p_as_of IS NULL OR m.movement_date<=p_as_of)),0)
      - coalesce(sum(m.amount) FILTER (WHERE m.direction='out' AND (a.opening_date IS NULL OR m.movement_date>=a.opening_date) AND (p_as_of IS NULL OR m.movement_date<=p_as_of)),0),
    (count(m.source_id) FILTER (WHERE a.opening_date IS NOT NULL AND m.movement_date<a.opening_date))::integer
  FROM public.payment_accounts a LEFT JOIN public.account_movements m ON m.account_id=a.id AND m.business_id=a.business_id
  GROUP BY a.id, a.opening_balance, a.opening_date
$$;
GRANT EXECUTE ON FUNCTION public.account_balances_as_of(date) TO authenticated;

-- 9. Provisional-balance warning: money paid by Gokul that has NO cash/bank account chosen, so no balance includes it.
CREATE OR REPLACE FUNCTION public.account_unassigned_outflows()
RETURNS TABLE(source text, entries integer, amount numeric)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
  SELECT 'Trip/LR expenses'::text, count(*)::integer, coalesce(sum(e.amount),0) FROM public.expenses e
    WHERE e.account_id IS NULL AND NOT e.is_cancelled AND e.payment_status='paid' AND e.responsible='gokul'
  UNION ALL SELECT 'Advances', count(*)::integer, coalesce(sum(a.amount),0) FROM public.advances a WHERE a.account_id IS NULL AND NOT a.is_cancelled
  UNION ALL SELECT 'Salary payments', count(*)::integer, coalesce(sum(s.amount),0) FROM public.salary_payments s WHERE s.account_id IS NULL AND NOT s.is_reversed AND s.amount>0
$$;
GRANT EXECUTE ON FUNCTION public.account_unassigned_outflows() TO authenticated;

-- 10. Atomic, idempotent payment/receipt save (one transaction: payment row + optional LR allocation).
--     The browser generates the payment id once per form; a repeated submit with the same id returns the existing row
--     and writes nothing (create=true). create=false edits that row. Runs as the caller, so RLS and all existing
--     triggers (ledger posting, edit guard, allocation check, account guard) still apply.
CREATE OR REPLACE FUNCTION public.save_payment(p jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE
  v_id uuid := nullif(p->>'id','')::uuid; v_biz uuid := public.current_business_id(); v_create boolean := coalesce((p->>'create')::boolean,false);
  v_amt numeric := (p->>'amount')::numeric; v_acct public.payment_accounts; v_mode text := coalesce(nullif(p->>'mode',''),'cash');
  v_lr uuid := nullif(p->>'lr_id','')::uuid; v_alloc numeric := coalesce(nullif(p->>'allocate_amount','')::numeric,0);
  v_type text := p->>'payment_type'; v_new uuid;
BEGIN
  IF v_biz IS NULL THEN RAISE EXCEPTION 'No business found for the signed-in user'; END IF;
  IF v_id IS NULL THEN RAISE EXCEPTION 'Payment id is required'; END IF;
  IF v_amt IS NULL OR v_amt<=0 OR round(v_amt,2)<>v_amt THEN RAISE EXCEPTION 'Amount must be greater than 0 with at most 2 decimals'; END IF;
  IF v_alloc<0 OR round(v_alloc,2)<>v_alloc OR v_alloc>v_amt THEN RAISE EXCEPTION 'Allocated amount must be between 0 and the payment amount'; END IF;
  IF nullif(p->>'party_id','') IS NULL AND nullif(p->>'transporter_id','') IS NULL THEN RAISE EXCEPTION 'Choose the party or transporter'; END IF;
  SELECT * INTO v_acct FROM public.payment_accounts WHERE id=nullif(p->>'account_id','')::uuid AND business_id=v_biz;
  IF NOT FOUND THEN RAISE EXCEPTION 'Choose Cash, Cash (Narinder) or a saved bank account'; END IF;
  IF v_acct.kind='cash' THEN v_mode:='cash'; ELSIF v_mode='cash' THEN RAISE EXCEPTION 'Choose how the bank payment was made (UPI, NEFT/RTGS/IMPS, cheque or other)'; END IF;

  IF v_create THEN
    IF EXISTS (SELECT 1 FROM public.payments WHERE id=v_id AND business_id=v_biz) THEN RETURN v_id; END IF; -- repeated submit: nothing written
    IF NOT v_acct.is_active THEN RAISE EXCEPTION 'Account "%" is inactive. Choose an active account', v_acct.display_name; END IF;
    INSERT INTO public.payments(id,payment_type,party_id,transporter_id,payer_name,amount,payment_date,mode,account_id,reference,notes,lr_id,trip_id,bank_name,bank_holder,bank_account_number,bank_ifsc,upi_id,txn_reference)
    VALUES(v_id,v_type,nullif(p->>'party_id','')::uuid,nullif(p->>'transporter_id','')::uuid,nullif(trim(p->>'payer_name'),''),v_amt,(p->>'payment_date')::date,v_mode,v_acct.id,
      nullif(trim(p->>'reference'),''),nullif(trim(p->>'notes'),''),v_lr,nullif(p->>'trip_id','')::uuid,nullif(p->>'bank_name',''),nullif(p->>'bank_holder',''),
      nullif(p->>'bank_account_number',''),nullif(p->>'bank_ifsc',''),nullif(p->>'upi_id',''),nullif(p->>'txn_reference',''))
    ON CONFLICT (id) DO NOTHING RETURNING id INTO v_new;
    IF v_new IS NULL THEN
      IF EXISTS (SELECT 1 FROM public.payments WHERE id=v_id AND business_id=v_biz) THEN RETURN v_id; END IF;
      RAISE EXCEPTION 'Payment could not be saved';
    END IF;
    IF v_lr IS NOT NULL AND v_alloc>0 THEN
      INSERT INTO public.payment_allocations(payment_id,lr_id,target,amount)
      VALUES(v_id,v_lr,CASE WHEN v_type IN ('transporter_payment','advance_paid') THEN 'payable' ELSE 'receivable' END,v_alloc);
    END IF;
  ELSE
    PERFORM 1 FROM public.payments WHERE id=v_id AND business_id=v_biz FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Payment not found or access denied'; END IF;
    UPDATE public.payments SET payment_type=v_type, party_id=nullif(p->>'party_id','')::uuid, transporter_id=nullif(p->>'transporter_id','')::uuid,
      payer_name=nullif(trim(p->>'payer_name'),''), amount=v_amt, payment_date=(p->>'payment_date')::date, mode=v_mode, account_id=v_acct.id,
      reference=nullif(trim(p->>'reference'),''), notes=nullif(trim(p->>'notes'),''), lr_id=v_lr, trip_id=nullif(p->>'trip_id','')::uuid,
      bank_name=nullif(p->>'bank_name',''), bank_holder=nullif(p->>'bank_holder',''), bank_account_number=nullif(p->>'bank_account_number',''),
      bank_ifsc=nullif(p->>'bank_ifsc',''), upi_id=nullif(p->>'upi_id',''), txn_reference=nullif(p->>'txn_reference','')
    WHERE id=v_id AND business_id=v_biz;
  END IF;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.save_payment(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_payment(jsonb) TO authenticated;

COMMIT;
