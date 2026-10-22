
-- ===== STAGE 1: FOUNDATION =====
DO $$ BEGIN CREATE TYPE public.app_role AS ENUM ('owner','admin','staff'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.businesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.businesses TO authenticated;
GRANT ALL ON public.businesses TO service_role;
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.business_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL UNIQUE,
  email text,
  display_name text,
  role public.app_role NOT NULL DEFAULT 'owner',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.business_members TO authenticated;
GRANT ALL ON public.business_members TO service_role;
ALTER TABLE public.business_members ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.current_business_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT business_id FROM public.business_members WHERE user_id = auth.uid() LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.is_business_member(p_business_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.business_members WHERE user_id = auth.uid() AND business_id = p_business_id)
$$;

CREATE OR REPLACE FUNCTION public.has_business_role(p_business_id uuid, p_role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.business_members WHERE user_id = auth.uid() AND business_id = p_business_id AND role = p_role)
$$;

DROP POLICY IF EXISTS "members read business" ON public.businesses;
CREATE POLICY "members read business" ON public.businesses FOR SELECT TO authenticated USING (public.is_business_member(id));
DROP POLICY IF EXISTS "owners update business" ON public.businesses;
CREATE POLICY "owners update business" ON public.businesses FOR UPDATE TO authenticated USING (public.has_business_role(id,'owner'));
DROP POLICY IF EXISTS "members read members" ON public.business_members;
CREATE POLICY "members read members" ON public.business_members FOR SELECT TO authenticated USING (public.is_business_member(business_id));

-- business_id stamping trigger
CREATE OR REPLACE FUNCTION public.stamp_business_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v := public.current_business_id();
    IF v IS NULL THEN
      IF auth.uid() IS NULL AND NEW.business_id IS NOT NULL THEN RETURN NEW; END IF; -- service role
      RAISE EXCEPTION 'No business found for the signed-in user';
    END IF;
    NEW.business_id := v;
    BEGIN NEW.created_by := auth.uid(); EXCEPTION WHEN undefined_column THEN NULL; END;
  ELSE
    NEW.business_id := OLD.business_id;
  END IF;
  RETURN NEW;
END $$;

CREATE TABLE IF NOT EXISTS public.business_settings (
  business_id uuid PRIMARY KEY REFERENCES public.businesses(id),
  trip_prefix text NOT NULL DEFAULT 'TRP-',
  lr_prefix text NOT NULL DEFAULT 'LR-',
  phone text, email text, address text, city text, state text,
  date_format text NOT NULL DEFAULT 'DD/MM/YYYY',
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.business_settings TO authenticated;
GRANT ALL ON public.business_settings TO service_role;
ALTER TABLE public.business_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "members read settings" ON public.business_settings;
CREATE POLICY "members read settings" ON public.business_settings FOR SELECT TO authenticated USING (public.is_business_member(business_id));
DROP POLICY IF EXISTS "owners update settings" ON public.business_settings;
CREATE POLICY "owners update settings" ON public.business_settings FOR UPDATE TO authenticated USING (public.has_business_role(business_id,'owner'));

CREATE TABLE IF NOT EXISTS public.doc_sequences (
  business_id uuid NOT NULL REFERENCES public.businesses(id),
  doc_type text NOT NULL,
  last_value bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (business_id, doc_type)
);
GRANT SELECT ON public.doc_sequences TO authenticated;
GRANT ALL ON public.doc_sequences TO service_role;
ALTER TABLE public.doc_sequences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "members read seq" ON public.doc_sequences;
CREATE POLICY "members read seq" ON public.doc_sequences FOR SELECT TO authenticated USING (public.is_business_member(business_id));

CREATE OR REPLACE FUNCTION public.next_doc_number(p_business_id uuid, p_doc_type text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_num bigint; v_prefix text;
BEGIN
  IF NOT public.is_business_member(p_business_id) THEN RAISE EXCEPTION 'Not allowed for this business'; END IF;
  INSERT INTO public.doc_sequences AS s (business_id, doc_type, last_value)
  VALUES (p_business_id, p_doc_type, 1)
  ON CONFLICT (business_id, doc_type) DO UPDATE SET last_value = s.last_value + 1
  RETURNING s.last_value INTO v_num;
  SELECT CASE p_doc_type WHEN 'trip' THEN bs.trip_prefix WHEN 'lr' THEN bs.lr_prefix ELSE upper(p_doc_type) || '-' END
    INTO v_prefix FROM public.business_settings bs WHERE bs.business_id = p_business_id;
  RETURN coalesce(v_prefix, '') || lpad(v_num::text, 4, '0');
END $$;

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL,
  table_name text NOT NULL,
  record_id uuid,
  action text NOT NULL,
  old_data jsonb, new_data jsonb,
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_logs_biz_idx ON public.audit_logs(business_id, created_at DESC);
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "members read audit" ON public.audit_logs;
CREATE POLICY "members read audit" ON public.audit_logs FOR SELECT TO authenticated USING (public.is_business_member(business_id));

CREATE OR REPLACE FUNCTION public.write_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_logs(business_id, table_name, record_id, action, old_data, user_id)
    VALUES (OLD.business_id, TG_TABLE_NAME, OLD.id, TG_OP, to_jsonb(OLD), auth.uid());
    RETURN OLD;
  END IF;
  INSERT INTO public.audit_logs(business_id, table_name, record_id, action, old_data, new_data, user_id)
  VALUES (NEW.business_id, TG_TABLE_NAME, NEW.id, TG_OP, CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) END, to_jsonb(NEW), auth.uid());
  RETURN NEW;
END $$;

CREATE TABLE IF NOT EXISTS public.ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id),
  account_type text NOT NULL CHECK (account_type IN ('party','driver','transporter','commission')),
  account_id uuid NOT NULL,
  source_table text NOT NULL,
  source_id uuid NOT NULL,
  line_kind text NOT NULL,
  entry_date date NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Kolkata')::date,
  description text,
  debit numeric(14,2) NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit numeric(14,2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
  reversal_of uuid REFERENCES public.ledger_entries(id),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_table, source_id, line_kind)
);
CREATE INDEX IF NOT EXISTS ledger_account_idx ON public.ledger_entries(business_id, account_type, account_id, entry_date);
GRANT SELECT ON public.ledger_entries TO authenticated;
GRANT ALL ON public.ledger_entries TO service_role;
ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "members read ledger" ON public.ledger_entries;
CREATE POLICY "members read ledger" ON public.ledger_entries FOR SELECT TO authenticated USING (public.is_business_member(business_id));

-- idempotent ledger upsert helper (internal use by triggers/functions)
CREATE OR REPLACE FUNCTION public.post_ledger(
  p_business_id uuid, p_account_type text, p_account_id uuid, p_source_table text, p_source_id uuid,
  p_line_kind text, p_entry_date date, p_description text, p_debit numeric, p_credit numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.ledger_entries(business_id, account_type, account_id, source_table, source_id, line_kind, entry_date, description, debit, credit, created_by)
  VALUES (p_business_id, p_account_type, p_account_id, p_source_table, p_source_id, p_line_kind, coalesce(p_entry_date, current_date), p_description, coalesce(p_debit,0), coalesce(p_credit,0), auth.uid())
  ON CONFLICT (source_table, source_id, line_kind) DO UPDATE
    SET account_type = EXCLUDED.account_type, account_id = EXCLUDED.account_id, entry_date = EXCLUDED.entry_date,
        description = EXCLUDED.description, debit = EXCLUDED.debit, credit = EXCLUDED.credit;
END $$;
REVOKE ALL ON FUNCTION public.post_ledger(uuid,text,uuid,text,uuid,text,date,text,numeric,numeric) FROM PUBLIC, anon, authenticated;

-- first run helpers
CREATE OR REPLACE FUNCTION public.setup_available()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT EXISTS (SELECT 1 FROM public.businesses)
$$;
GRANT EXECUTE ON FUNCTION public.setup_available() TO anon, authenticated;

-- system check: RLS status of every public table
CREATE OR REPLACE FUNCTION public.system_rls_status()
RETURNS TABLE(table_name text, rls_enabled boolean) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.relname::text, c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND public.current_business_id() IS NOT NULL ORDER BY 1
$$;

-- ===== STAGE 2: MASTERS =====
CREATE TABLE IF NOT EXISTS public.parties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id),
  name text NOT NULL,
  name_normalized text GENERATED ALWAYS AS (lower(regexp_replace(trim(name), '\s+', ' ', 'g'))) STORED,
  roles text[] NOT NULL DEFAULT '{}',
  contact_person text, phone text, alt_phone text, address text, city text, state text, notes text,
  is_active boolean NOT NULL DEFAULT true,
  opening_balance numeric(14,2) NOT NULL DEFAULT 0 CHECK (opening_balance >= 0),
  opening_type text NOT NULL DEFAULT 'none' CHECK (opening_type IN ('none','receivable','payable')),
  opening_date date,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, name_normalized)
);

CREATE TABLE IF NOT EXISTS public.drivers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id),
  name text NOT NULL, phone text, licence_number text, joining_date date, address text, notes text,
  salary_amount numeric(14,2), salary_frequency text DEFAULT 'monthly',
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id),
  registration_number text NOT NULL,
  registration_normalized text GENERATED ALWAYS AS (upper(regexp_replace(registration_number, '[^A-Za-z0-9]', '', 'g'))) STORED,
  vehicle_type text, capacity text, notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, registration_normalized)
);

CREATE TABLE IF NOT EXISTS public.routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id),
  origin text NOT NULL, destination text NOT NULL, distance_km numeric(10,1), notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.transporters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id),
  name text NOT NULL,
  name_normalized text GENERATED ALWAYS AS (lower(regexp_replace(trim(name), '\s+', ' ', 'g'))) STORED,
  phone text, notes text,
  party_id uuid REFERENCES public.parties(id),
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, name_normalized)
);

CREATE TABLE IF NOT EXISTS public.payment_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id),
  kind text NOT NULL DEFAULT 'bank' CHECK (kind IN ('cash','bank')),
  display_name text NOT NULL, bank_name text, account_holder text, account_number text, ifsc text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS one_cash_per_business ON public.payment_accounts(business_id) WHERE kind = 'cash';

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['parties','drivers','vehicles','routes','transporters','payment_accounts'] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "members select" ON public.%I', t);
    EXECUTE format('CREATE POLICY "members select" ON public.%I FOR SELECT TO authenticated USING (public.is_business_member(business_id))', t);
    EXECUTE format('DROP POLICY IF EXISTS "members insert" ON public.%I', t);
    EXECUTE format('CREATE POLICY "members insert" ON public.%I FOR INSERT TO authenticated WITH CHECK (public.is_business_member(business_id))', t);
    EXECUTE format('DROP POLICY IF EXISTS "members update" ON public.%I', t);
    EXECUTE format('CREATE POLICY "members update" ON public.%I FOR UPDATE TO authenticated USING (public.is_business_member(business_id)) WITH CHECK (public.is_business_member(business_id))', t);
    EXECUTE format('DROP TRIGGER IF EXISTS a_stamp_business ON public.%I', t);
    EXECUTE format('CREATE TRIGGER a_stamp_business BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.stamp_business_id()', t);
    EXECUTE format('DROP TRIGGER IF EXISTS z_audit ON public.%I', t);
    EXECUTE format('CREATE TRIGGER z_audit AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.write_audit()', t);
  END LOOP;
END $$;

DROP TRIGGER IF EXISTS z_audit ON public.business_settings;
-- settings audit (has business_id but no id) handled separately
CREATE OR REPLACE FUNCTION public.audit_settings()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  INSERT INTO public.audit_logs(business_id, table_name, record_id, action, old_data, new_data, user_id)
  VALUES (NEW.business_id, 'business_settings', NEW.business_id, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW), auth.uid());
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS settings_audit ON public.business_settings;
CREATE TRIGGER settings_audit BEFORE UPDATE ON public.business_settings FOR EACH ROW EXECUTE FUNCTION public.audit_settings();

-- Cash account cannot be deactivated or renamed to bank
CREATE OR REPLACE FUNCTION public.protect_cash_account()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.kind = 'cash' AND (NEW.kind <> 'cash' OR NEW.is_active = false) THEN
    RAISE EXCEPTION 'The Cash account is permanent and cannot be deactivated';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS b_protect_cash ON public.payment_accounts;
CREATE TRIGGER b_protect_cash BEFORE UPDATE ON public.payment_accounts FOR EACH ROW EXECUTE FUNCTION public.protect_cash_account();

-- Party opening balance -> one ledger row (idempotent, never revenue)
CREATE OR REPLACE FUNCTION public.party_opening_ledger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.opening_type = 'none' OR NEW.opening_balance = 0 THEN
    IF EXISTS (SELECT 1 FROM public.ledger_entries WHERE source_table='parties' AND source_id=NEW.id AND line_kind='opening_balance') THEN
      UPDATE public.ledger_entries SET debit=0, credit=0, description='Opening balance (cleared)'
       WHERE source_table='parties' AND source_id=NEW.id AND line_kind='opening_balance';
    END IF;
  ELSE
    PERFORM public.post_ledger(NEW.business_id, 'party', NEW.id, 'parties', NEW.id, 'opening_balance',
      coalesce(NEW.opening_date, current_date), 'Opening balance',
      CASE WHEN NEW.opening_type='receivable' THEN NEW.opening_balance ELSE 0 END,
      CASE WHEN NEW.opening_type='payable' THEN NEW.opening_balance ELSE 0 END);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS c_party_opening ON public.parties;
CREATE TRIGGER c_party_opening AFTER INSERT OR UPDATE OF opening_balance, opening_type, opening_date ON public.parties
FOR EACH ROW EXECUTE FUNCTION public.party_opening_ledger();

-- find-or-create transporter by normalised name (never duplicates)
CREATE OR REPLACE FUNCTION public.get_or_create_transporter(p_name text)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_id uuid; v_biz uuid := public.current_business_id(); v_norm text;
BEGIN
  IF v_biz IS NULL THEN RAISE EXCEPTION 'No business found for the signed-in user'; END IF;
  v_norm := lower(regexp_replace(trim(p_name), '\s+', ' ', 'g'));
  IF v_norm = '' THEN RAISE EXCEPTION 'Transporter name is required'; END IF;
  SELECT id INTO v_id FROM public.transporters WHERE business_id = v_biz AND name_normalized = v_norm;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  INSERT INTO public.transporters(business_id, name) VALUES (v_biz, trim(p_name))
  ON CONFLICT (business_id, name_normalized) DO NOTHING RETURNING id INTO v_id;
  IF v_id IS NULL THEN SELECT id INTO v_id FROM public.transporters WHERE business_id = v_biz AND name_normalized = v_norm; END IF;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.get_or_create_transporter(text) TO authenticated;

-- account balance view (computed from ledger only)
CREATE OR REPLACE VIEW public.account_balances WITH (security_invoker = true) AS
SELECT business_id, account_type, account_id, sum(debit) AS total_debit, sum(credit) AS total_credit, sum(debit) - sum(credit) AS balance
FROM public.ledger_entries GROUP BY business_id, account_type, account_id;
GRANT SELECT ON public.account_balances TO authenticated;
