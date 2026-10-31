
-- 1. Account transfers (cash-to-bank deposits and bank-to-bank moves): both sides recorded, never income/expense.
CREATE TABLE public.account_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id),
  from_account_id uuid NOT NULL REFERENCES public.payment_accounts(id),
  to_account_id uuid NOT NULL REFERENCES public.payment_accounts(id),
  amount numeric NOT NULL,
  transfer_date date NOT NULL,
  reference text,
  notes text,
  is_reversed boolean NOT NULL DEFAULT false,
  reversal_reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT account_transfers_distinct CHECK (from_account_id <> to_account_id),
  CONSTRAINT account_transfers_amount CHECK (amount > 0 AND round(amount, 2) = amount)
);
GRANT SELECT, INSERT, UPDATE ON public.account_transfers TO authenticated;
GRANT ALL ON public.account_transfers TO service_role;
ALTER TABLE public.account_transfers ENABLE ROW LEVEL SECURITY;
CREATE POLICY account_transfers_select ON public.account_transfers FOR SELECT TO authenticated USING (public.is_business_member(business_id));
CREATE POLICY account_transfers_insert ON public.account_transfers FOR INSERT TO authenticated WITH CHECK (public.is_business_member(business_id));
CREATE POLICY account_transfers_update ON public.account_transfers FOR UPDATE TO authenticated USING (public.is_business_member(business_id)) WITH CHECK (public.is_business_member(business_id));
CREATE TRIGGER a_stamp_business BEFORE INSERT OR UPDATE ON public.account_transfers FOR EACH ROW EXECUTE FUNCTION stamp_business_id();
CREATE TRIGGER z_audit AFTER INSERT OR UPDATE OR DELETE ON public.account_transfers FOR EACH ROW EXECUTE FUNCTION write_audit();

-- 2. Idempotent transfer save: a retry with the same id returns the existing row instead of duplicating.
CREATE OR REPLACE FUNCTION public.save_account_transfer(p jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  v_id uuid := nullif(p->>'id','')::uuid;
  v_biz uuid := public.current_business_id();
  v_amt numeric := (p->>'amount')::numeric;
  v_from uuid := nullif(p->>'from_account_id','')::uuid;
  v_to uuid := nullif(p->>'to_account_id','')::uuid;
BEGIN
  IF auth.uid() IS NULL OR v_biz IS NULL THEN RAISE EXCEPTION 'Sign in with business access required'; END IF;
  IF v_id IS NULL THEN RAISE EXCEPTION 'Transfer id is required'; END IF;
  IF v_amt IS NULL OR v_amt <= 0 OR round(v_amt, 2) <> v_amt THEN RAISE EXCEPTION 'Amount must be greater than 0 with at most 2 decimals'; END IF;
  IF v_from IS NULL OR v_to IS NULL OR v_from = v_to THEN RAISE EXCEPTION 'Choose two different accounts'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.payment_accounts WHERE id = v_from AND business_id = v_biz AND is_active) THEN RAISE EXCEPTION 'Source account not found or inactive'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.payment_accounts WHERE id = v_to AND business_id = v_biz AND is_active) THEN RAISE EXCEPTION 'Destination account not found or inactive'; END IF;
  INSERT INTO public.account_transfers(id, business_id, from_account_id, to_account_id, amount, transfer_date, reference, notes, created_by)
  VALUES (v_id, v_biz, v_from, v_to, v_amt, coalesce(nullif(p->>'transfer_date','')::date, current_date), nullif(trim(p->>'reference'),''), nullif(trim(p->>'notes'),''), auth.uid())
  ON CONFLICT (id) DO NOTHING;
  RETURN v_id;
END $fn$;

-- 3. Transfers are reversed with a reason, never deleted.
CREATE OR REPLACE FUNCTION public.reverse_account_transfer(p_id uuid, p_reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_biz uuid := public.current_business_id();
BEGIN
  IF auth.uid() IS NULL OR v_biz IS NULL THEN RAISE EXCEPTION 'Sign in with business access required'; END IF;
  IF nullif(trim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'Reversal reason required'; END IF;
  UPDATE public.account_transfers SET is_reversed = true, reversal_reason = trim(p_reason), updated_at = now()
  WHERE id = p_id AND business_id = v_biz AND NOT is_reversed;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transfer not found or already reversed'; END IF;
END $fn$;

REVOKE ALL ON FUNCTION public.save_account_transfer(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reverse_account_transfer(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_account_transfer(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reverse_account_transfer(uuid, text) TO authenticated, service_role;

-- 4. Transporter/Supplier Receipt: money received FROM a transporter credits the transporter ledger
--    (same direction as commission received) instead of debiting it like a payment made to them.
CREATE OR REPLACE FUNCTION public.payment_after() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_amt numeric := CASE WHEN NEW.is_reversed THEN 0 ELSE NEW.amount END; v_desc text;
BEGIN
  v_desc := CASE NEW.payment_type
    WHEN 'customer_receipt' THEN 'Receipt'
    WHEN 'third_party_receipt' THEN 'Collected from ' || NEW.payer_name || ' on behalf of party'
    WHEN 'transporter_payment' THEN 'Payment made'
    WHEN 'transporter_receipt' THEN 'Receipt from transporter'
    WHEN 'advance_paid' THEN 'Advance paid'
    ELSE 'Advance received' END || coalesce(' · ' || NEW.reference, '') || CASE WHEN NEW.is_reversed THEN ' (REVERSED)' ELSE '' END;
  IF NEW.payment_type IN ('customer_receipt','third_party_receipt','advance_received') THEN
    PERFORM public.ledger_set(NEW.business_id, 'party', NEW.party_id, 'payments', NEW.id, 'payment', NEW.payment_date, v_desc, 0, v_amt);
  ELSIF NEW.payment_type = 'transporter_receipt' THEN
    PERFORM public.ledger_set(NEW.business_id, 'transporter', NEW.transporter_id, 'payments', NEW.id, 'payment', NEW.payment_date, v_desc, 0, v_amt);
  ELSIF NEW.transporter_id IS NOT NULL THEN
    PERFORM public.ledger_set(NEW.business_id, 'transporter', NEW.transporter_id, 'payments', NEW.id, 'payment', NEW.payment_date, v_desc, v_amt, 0);
  ELSE
    PERFORM public.ledger_set(NEW.business_id, 'party', NEW.party_id, 'payments', NEW.id, 'payment', NEW.payment_date, v_desc, v_amt, 0);
  END IF;
  RETURN NEW;
END $fn$;

-- 5. save_payment: transporter receipts require a transporter and allocate against LR payable.
CREATE OR REPLACE FUNCTION public.save_payment(p jsonb) RETURNS uuid
LANGUAGE plpgsql SET search_path TO 'public' AS $fn$
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
  IF v_type IN ('transporter_payment','transporter_receipt') AND nullif(p->>'transporter_id','') IS NULL THEN RAISE EXCEPTION 'Choose the transporter'; END IF;
  SELECT * INTO v_acct FROM public.payment_accounts WHERE id=nullif(p->>'account_id','')::uuid AND business_id=v_biz;
  IF NOT FOUND THEN RAISE EXCEPTION 'Choose Cash, Cash Received by Narinder or a saved bank account'; END IF;
  IF v_acct.kind='cash' THEN v_mode:='cash'; ELSIF v_mode='cash' THEN RAISE EXCEPTION 'Choose how the bank payment was made (UPI, NEFT/RTGS/IMPS, cheque or other)'; END IF;
  IF v_create THEN
    IF EXISTS (SELECT 1 FROM public.payments WHERE id=v_id AND business_id=v_biz) THEN RETURN v_id; END IF;
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
      VALUES(v_id,v_lr,CASE WHEN v_type IN ('transporter_payment','transporter_receipt','advance_paid') THEN 'payable' ELSE 'receivable' END,v_alloc);
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
END $fn$;

-- 6. Account statements: transporter receipts count as money in; transfers appear on both accounts.
CREATE OR REPLACE VIEW public.account_movements AS
 SELECT p.business_id, p.account_id, p.payment_date AS movement_date, p.created_at,
    'payments'::text AS source_table, p.id AS source_id, p.payment_type AS source_type,
    CASE WHEN p.payment_type = ANY (ARRAY['customer_receipt','advance_received','third_party_receipt','transporter_receipt']) THEN 'in'::text ELSE 'out'::text END AS direction,
    p.amount, COALESCE(p.reference, p.txn_reference) AS reference, p.notes AS description,
    p.party_id, p.transporter_id, NULL::uuid AS driver_id, p.payer_name AS other_name
   FROM public.payments p WHERE NOT p.is_reversed
UNION ALL
 SELECT e.business_id, e.account_id, e.expense_date, e.created_at, 'expenses'::text, e.id, 'expense'::text, 'out'::text,
    e.amount, e.reference, e.category || COALESCE(' · ' || e.paid_to, ''), NULL::uuid, NULL::uuid, NULL::uuid, NULL::text
   FROM public.expenses e WHERE e.account_id IS NOT NULL AND NOT e.is_cancelled AND e.payment_status = 'paid' AND e.responsible = 'gokul'
UNION ALL
 SELECT a.business_id, a.account_id, a.advance_date, a.created_at, 'advances'::text, a.id, 'advance'::text, 'out'::text,
    a.amount, a.reference, 'Advance paid'::text, a.party_id, a.transporter_id, a.driver_id, a.other_name
   FROM public.advances a WHERE a.account_id IS NOT NULL AND NOT a.is_cancelled
UNION ALL
 SELECT s.business_id, s.account_id, s.payment_date, s.created_at, 'salary_payments'::text, s.id, 'salary_payment'::text, 'out'::text,
    s.amount, s.reference, 'Salary paid'::text, NULL::uuid, NULL::uuid, s.driver_id, NULL::text
   FROM public.salary_payments s WHERE s.account_id IS NOT NULL AND NOT s.is_reversed AND s.amount > 0
UNION ALL
 SELECT c.business_id, c.account_id, c.receipt_date, c.created_at, 'commission_receipts'::text, c.id, 'commission_receipt'::text, 'in'::text,
    c.amount, c.reference, 'Commission received'::text, NULL::uuid, c.transporter_id, c.driver_id, NULL::text
   FROM public.commission_receipts c WHERE c.account_id IS NOT NULL AND c.salary_payment_id IS NULL AND NOT c.is_reversed
UNION ALL
 SELECT t.business_id, t.from_account_id, t.transfer_date, t.created_at, 'account_transfers'::text, t.id, 'transfer_out'::text, 'out'::text,
    t.amount, t.reference, 'Transfer to ' || COALESCE((SELECT d.display_name FROM public.payment_accounts d WHERE d.id = t.to_account_id), 'account'),
    NULL::uuid, NULL::uuid, NULL::uuid, NULL::text
   FROM public.account_transfers t WHERE NOT t.is_reversed
UNION ALL
 SELECT t.business_id, t.to_account_id, t.transfer_date, t.created_at, 'account_transfers'::text, t.id, 'transfer_in'::text, 'in'::text,
    t.amount, t.reference, 'Transfer from ' || COALESCE((SELECT d.display_name FROM public.payment_accounts d WHERE d.id = t.from_account_id), 'account'),
    NULL::uuid, NULL::uuid, NULL::uuid, NULL::text
   FROM public.account_transfers t WHERE NOT t.is_reversed;
