-- Cash / bank account opening balances + live balances.
-- Backward-compatible: only ADDS two columns (existing rows default to 0 / no date), one guard
-- trigger and two read-only views. No table, column or row is dropped or rewritten.
--
-- Convention: opening_balance is the balance at the START of opening_date. Only movements dated
-- on/after opening_date count towards the account balance, so a bank statement that starts on
-- opening_date (with that opening balance) matches the app. Negative = overdraft (bank only).

ALTER TABLE public.payment_accounts
  ADD COLUMN IF NOT EXISTS opening_balance numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS opening_date date;

CREATE OR REPLACE FUNCTION public.guard_account_opening()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF coalesce(NEW.opening_balance, 0) <> 0 AND NEW.opening_date IS NULL THEN
    RAISE EXCEPTION 'Choose the opening balance date (the date your statement starts)';
  END IF;
  IF NEW.kind = 'cash' AND coalesce(NEW.opening_balance, 0) < 0 THEN
    RAISE EXCEPTION 'Cash opening balance cannot be negative';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS c_guard_account_opening ON public.payment_accounts;
CREATE TRIGGER c_guard_account_opening BEFORE INSERT OR UPDATE ON public.payment_accounts
  FOR EACH ROW EXECUTE FUNCTION public.guard_account_opening();
-- (z_audit already logs every change to opening_balance / opening_date: old + new values, user, time.)

-- Every rupee that moved in/out of a cash/bank account. Reversed / cancelled rows are excluded.
CREATE OR REPLACE VIEW public.account_movements WITH (security_invoker = true) AS
  SELECT business_id, account_id, payment_date AS entry_date, 'payments'::text AS source_table, id AS source_id,
         CASE WHEN payment_type IN ('customer_receipt','advance_received','third_party_receipt') THEN amount ELSE -amount END AS signed_amount
    FROM public.payments WHERE NOT is_reversed AND account_id IS NOT NULL
  UNION ALL
  SELECT business_id, account_id, expense_date, 'expenses', id, -amount
    FROM public.expenses WHERE NOT is_cancelled AND payment_status = 'paid' AND account_id IS NOT NULL
  UNION ALL
  SELECT business_id, account_id, advance_date, 'advances', id, -amount
    FROM public.advances WHERE NOT is_cancelled AND account_id IS NOT NULL
  UNION ALL
  SELECT business_id, account_id, payment_date, 'salary_payments', id, -amount
    FROM public.salary_payments WHERE NOT is_reversed AND account_id IS NOT NULL AND amount > 0
  UNION ALL
  SELECT business_id, account_id, receipt_date, 'commission_receipts', id, amount
    FROM public.commission_receipts WHERE NOT is_reversed AND salary_payment_id IS NULL AND account_id IS NOT NULL;

CREATE OR REPLACE VIEW public.payment_account_balances WITH (security_invoker = true) AS
  SELECT a.id AS account_id, a.business_id, a.opening_balance, a.opening_date,
         coalesce(sum(m.signed_amount) FILTER (WHERE m.signed_amount > 0 AND (a.opening_date IS NULL OR m.entry_date >= a.opening_date)), 0)::numeric(14,2) AS total_in,
         coalesce(-sum(m.signed_amount) FILTER (WHERE m.signed_amount < 0 AND (a.opening_date IS NULL OR m.entry_date >= a.opening_date)), 0)::numeric(14,2) AS total_out,
         (a.opening_balance + coalesce(sum(m.signed_amount) FILTER (WHERE a.opening_date IS NULL OR m.entry_date >= a.opening_date), 0))::numeric(14,2) AS balance,
         (count(m.source_id) FILTER (WHERE a.opening_date IS NOT NULL AND m.entry_date < a.opening_date))::int AS entries_before_opening
    FROM public.payment_accounts a
    LEFT JOIN public.account_movements m ON m.account_id = a.id
   GROUP BY a.id;
GRANT SELECT ON public.account_movements, public.payment_account_balances TO authenticated;
GRANT ALL ON public.account_movements, public.payment_account_balances TO service_role;
