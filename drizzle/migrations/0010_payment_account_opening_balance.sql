-- Backward-compatible: adds two columns to payment_accounts. No existing rows, columns, tables or policies are changed.
-- Existing accounts get opening_balance = 0 and opening_date = NULL (i.e. behave exactly as before).
ALTER TABLE public.payment_accounts ADD COLUMN IF NOT EXISTS opening_balance numeric(14,2) NOT NULL DEFAULT 0;
ALTER TABLE public.payment_accounts ADD COLUMN IF NOT EXISTS opening_date date;
