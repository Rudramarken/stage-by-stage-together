
-- ===== TRIPS =====
CREATE TABLE IF NOT EXISTS public.trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id),
  trip_number text NOT NULL,
  trip_date date NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Kolkata')::date,
  journey_type text NOT NULL DEFAULT 'single' CHECK (journey_type IN ('single','multi','round')),
  direction text NOT NULL DEFAULT 'up' CHECK (direction IN ('up','down','other')),
  status text NOT NULL DEFAULT 'booked' CHECK (status IN ('draft','booked','in_transit','delivered','completed','cancelled')),
  parent_trip_id uuid REFERENCES public.trips(id),
  leg_label text,
  vehicle_mode text NOT NULL DEFAULT 'own' CHECK (vehicle_mode IN ('own','market')),
  vehicle_id uuid REFERENCES public.vehicles(id),
  market_vehicle_number text, market_vehicle_type text,
  transporter_id uuid REFERENCES public.transporters(id),
  driver_id uuid REFERENCES public.drivers(id),
  driver_name text,
  notes text, cancel_reason text,
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, trip_number)
);

CREATE TABLE IF NOT EXISTS public.trip_stops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  seq int NOT NULL DEFAULT 0,
  location text NOT NULL,
  stop_type text NOT NULL DEFAULT 'intermediate' CHECK (stop_type IN ('loading','unloading','both','intermediate')),
  planned_arrival timestamptz, planned_departure timestamptz, actual_arrival timestamptz, actual_departure timestamptz,
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','arrived','completed','skipped')),
  notes text, created_by uuid, created_at timestamptz NOT NULL DEFAULT now()
);

-- ===== LR =====
CREATE TABLE IF NOT EXISTS public.lrs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id),
  lr_number text NOT NULL,
  lr_date date NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Kolkata')::date,
  trip_id uuid REFERENCES public.trips(id),
  loading_stop_id uuid REFERENCES public.trip_stops(id) ON DELETE SET NULL,
  unloading_stop_id uuid REFERENCES public.trip_stops(id) ON DELETE SET NULL,
  goods_description text, quantity numeric(14,2), weight numeric(14,3),
  weight_unit text NOT NULL DEFAULT 'kg' CHECK (weight_unit IN ('kg','quintal','tonne')),
  loading_point text, delivery_point text, notes text,
  delivery_status text NOT NULL DEFAULT 'pending' CHECK (delivery_status IN ('pending','in_transit','delivered')),
  freight_type text NOT NULL DEFAULT 'to_pay' CHECK (freight_type IN ('paid','to_pay','tbb')),
  billing_party_id uuid REFERENCES public.parties(id),
  rate_unit text NOT NULL DEFAULT 'fixed' CHECK (rate_unit IN ('per_kg','per_quintal','per_tonne','fixed')),
  rate numeric(14,2) CHECK (rate IS NULL OR rate >= 0),
  base_freight numeric(14,2) NOT NULL DEFAULT 0,
  additions_total numeric(14,2) NOT NULL DEFAULT 0,
  deductions_total numeric(14,2) NOT NULL DEFAULT 0,
  final_freight numeric(14,2) NOT NULL DEFAULT 0,
  transporter_id uuid REFERENCES public.transporters(id),
  vehicle_number text, vehicle_type text, driver_name text,
  freight_payable numeric(14,2) NOT NULL DEFAULT 0 CHECK (freight_payable >= 0),
  direct_payment_enabled boolean NOT NULL DEFAULT false,
  direct_payment_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (direct_payment_amount >= 0),
  commission_enabled boolean NOT NULL DEFAULT false,
  commission_mode text NOT NULL DEFAULT 'fixed' CHECK (commission_mode IN ('fixed','percent')),
  commission_value numeric(14,2) NOT NULL DEFAULT 0 CHECK (commission_value >= 0),
  commission_amount numeric(14,2) NOT NULL DEFAULT 0,
  commission_payer_party_id uuid REFERENCES public.parties(id),
  commission_status text NOT NULL DEFAULT 'pending' CHECK (commission_status IN ('pending','received')),
  commission_date date, commission_reference text, commission_notes text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','cancelled')),
  cancel_reason text,
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, lr_number)
);

CREATE TABLE IF NOT EXISTS public.lr_parties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id),
  lr_id uuid NOT NULL REFERENCES public.lrs(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('consignor','consignee')),
  party_id uuid NOT NULL REFERENCES public.parties(id),
  seq int NOT NULL DEFAULT 0,
  goods_description text, quantity numeric(14,2), weight numeric(14,3),
  loading_point text, delivery_point text,
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.lr_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id),
  lr_id uuid NOT NULL REFERENCES public.lrs(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('add','deduct')),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  reason text NOT NULL CHECK (length(trim(reason)) > 0),
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now()
);

-- ===== MONEY =====
CREATE TABLE IF NOT EXISTS public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id),
  scope text NOT NULL DEFAULT 'trip' CHECK (scope IN ('trip','consignor','consignee')),
  trip_id uuid REFERENCES public.trips(id),
  lr_id uuid REFERENCES public.lrs(id),
  lr_party_id uuid REFERENCES public.lr_parties(id) ON DELETE SET NULL,
  category text NOT NULL,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  expense_date date NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Kolkata')::date,
  paid_by text, paid_to text,
  responsible text NOT NULL DEFAULT 'gokul' CHECK (responsible IN ('gokul','party')),
  responsible_party_id uuid REFERENCES public.parties(id),
  payment_method text, account_id uuid REFERENCES public.payment_accounts(id),
  payment_status text NOT NULL DEFAULT 'paid' CHECK (payment_status IN ('paid','pending')),
  reference text, notes text,
  is_cancelled boolean NOT NULL DEFAULT false, cancel_reason text,
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.advances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id),
  trip_id uuid REFERENCES public.trips(id),
  recipient_type text NOT NULL CHECK (recipient_type IN ('driver','transporter','truck_owner','other')),
  driver_id uuid REFERENCES public.drivers(id),
  transporter_id uuid REFERENCES public.transporters(id),
  party_id uuid REFERENCES public.parties(id),
  other_name text,
  advance_date date NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Kolkata')::date,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  payment_method text, account_id uuid REFERENCES public.payment_accounts(id),
  reference text, notes text,
  is_cancelled boolean NOT NULL DEFAULT false, cancel_reason text,
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id),
  payment_type text NOT NULL CHECK (payment_type IN ('customer_receipt','transporter_payment','advance_paid','advance_received','third_party_receipt')),
  party_id uuid REFERENCES public.parties(id),
  transporter_id uuid REFERENCES public.transporters(id),
  payer_name text,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  payment_date date NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Kolkata')::date,
  mode text NOT NULL DEFAULT 'cash',
  account_id uuid NOT NULL REFERENCES public.payment_accounts(id),
  reference text, notes text,
  lr_id uuid REFERENCES public.lrs(id), trip_id uuid REFERENCES public.trips(id),
  bank_name text, bank_holder text, bank_account_number text, bank_ifsc text, upi_id text, txn_reference text,
  is_reversed boolean NOT NULL DEFAULT false, reversal_reason text,
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (party_id IS NOT NULL OR transporter_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS public.payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id),
  payment_id uuid NOT NULL REFERENCES public.payments(id),
  lr_id uuid NOT NULL REFERENCES public.lrs(id),
  target text NOT NULL CHECK (target IN ('receivable','payable')),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.salary_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id),
  driver_id uuid NOT NULL REFERENCES public.drivers(id),
  period text NOT NULL,
  due_date date,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  notes text,
  is_cancelled boolean NOT NULL DEFAULT false,
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (driver_id, period)
);

CREATE TABLE IF NOT EXISTS public.salary_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id),
  driver_id uuid NOT NULL REFERENCES public.drivers(id),
  salary_entry_id uuid NOT NULL REFERENCES public.salary_entries(id),
  payment_date date NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Kolkata')::date,
  amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  recovered_advance numeric(14,2) NOT NULL DEFAULT 0 CHECK (recovered_advance >= 0),
  payment_method text, account_id uuid REFERENCES public.payment_accounts(id),
  reference text, notes text,
  is_reversed boolean NOT NULL DEFAULT false, reversal_reason text,
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (amount > 0 OR recovered_advance > 0)
);

-- grants, RLS, stamp + audit triggers
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['trips','trip_stops','lrs','lr_parties','lr_adjustments','expenses','advances','payments','payment_allocations','salary_entries','salary_payments'] LOOP
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
  -- non-financial child rows may be removed while editing
  FOREACH t IN ARRAY ARRAY['trip_stops','lr_parties','lr_adjustments'] LOOP
    EXECUTE format('GRANT DELETE ON public.%I TO authenticated', t);
    EXECUTE format('DROP POLICY IF EXISTS "members delete" ON public.%I', t);
    EXECUTE format('CREATE POLICY "members delete" ON public.%I FOR DELETE TO authenticated USING (public.is_business_member(business_id))', t);
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS trips_biz_date ON public.trips(business_id, trip_date DESC);
CREATE INDEX IF NOT EXISTS lrs_trip ON public.lrs(trip_id);
CREATE INDEX IF NOT EXISTS lr_parties_lr ON public.lr_parties(lr_id);
CREATE INDEX IF NOT EXISTS expenses_trip ON public.expenses(trip_id);
CREATE INDEX IF NOT EXISTS expenses_lr ON public.expenses(lr_id);
CREATE INDEX IF NOT EXISTS advances_trip ON public.advances(trip_id);
CREATE INDEX IF NOT EXISTS payments_biz_date ON public.payments(business_id, payment_date DESC);

-- ===== helpers =====
CREATE OR REPLACE FUNCTION public.ledger_set(
  p_business_id uuid, p_account_type text, p_account_id uuid, p_source_table text, p_source_id uuid,
  p_line_kind text, p_entry_date date, p_description text, p_debit numeric, p_credit numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_account_id IS NULL OR (coalesce(p_debit,0) = 0 AND coalesce(p_credit,0) = 0) THEN
    UPDATE public.ledger_entries SET debit = 0, credit = 0, entry_date = coalesce(p_entry_date, entry_date), description = p_description
     WHERE source_table = p_source_table AND source_id = p_source_id AND line_kind = p_line_kind;
  ELSE
    PERFORM public.post_ledger(p_business_id, p_account_type, p_account_id, p_source_table, p_source_id, p_line_kind, p_entry_date, p_description, p_debit, p_credit);
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.ledger_set(uuid,text,uuid,text,uuid,text,date,text,numeric,numeric) FROM PUBLIC, anon, authenticated;

-- trip number + cancel guard
CREATE OR REPLACE FUNCTION public.trip_before()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' AND (NEW.trip_number IS NULL OR NEW.trip_number = '') THEN
    NEW.trip_number := public.next_doc_number(NEW.business_id, 'trip');
  END IF;
  IF TG_OP = 'UPDATE' THEN
    NEW.updated_at := now();
    IF NEW.status = 'cancelled' AND OLD.status <> 'cancelled' THEN
      IF coalesce(trim(NEW.cancel_reason), '') = '' THEN RAISE EXCEPTION 'A reason is required to cancel a trip'; END IF;
      IF EXISTS (SELECT 1 FROM public.payments WHERE trip_id = NEW.id AND NOT is_reversed) THEN
        RAISE EXCEPTION 'This trip has payments recorded. Reverse those payments first, then cancel the trip.';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS b_trip_before ON public.trips;
CREATE TRIGGER b_trip_before BEFORE INSERT OR UPDATE ON public.trips FOR EACH ROW EXECUTE FUNCTION public.trip_before();

-- LR calculation
CREATE OR REPLACE FUNCTION public.lr_before()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_kg numeric; v_add numeric := 0; v_ded numeric := 0;
BEGIN
  IF TG_OP = 'INSERT' AND (NEW.lr_number IS NULL OR NEW.lr_number = '') THEN
    NEW.lr_number := public.next_doc_number(NEW.business_id, 'lr');
  END IF;
  NEW.updated_at := now();
  v_kg := coalesce(NEW.weight, 0) * CASE NEW.weight_unit WHEN 'quintal' THEN 100 WHEN 'tonne' THEN 1000 ELSE 1 END;
  NEW.base_freight := round(CASE NEW.rate_unit
    WHEN 'fixed' THEN coalesce(NEW.rate, 0)
    WHEN 'per_kg' THEN v_kg * coalesce(NEW.rate, 0)
    WHEN 'per_quintal' THEN v_kg / 100 * coalesce(NEW.rate, 0)
    WHEN 'per_tonne' THEN v_kg / 1000 * coalesce(NEW.rate, 0) END, 2);
  IF TG_OP = 'UPDATE' THEN
    SELECT coalesce(sum(amount) FILTER (WHERE kind = 'add'), 0), coalesce(sum(amount) FILTER (WHERE kind = 'deduct'), 0)
      INTO v_add, v_ded FROM public.lr_adjustments WHERE lr_id = NEW.id;
  END IF;
  NEW.additions_total := v_add;
  NEW.deductions_total := v_ded;
  NEW.final_freight := NEW.base_freight + v_add - v_ded;
  IF NEW.final_freight < 0 THEN RAISE EXCEPTION 'Final freight cannot be negative (deductions are larger than freight)'; END IF;
  NEW.commission_amount := CASE WHEN NOT NEW.commission_enabled THEN 0
    WHEN NEW.commission_mode = 'percent' THEN round(NEW.final_freight * NEW.commission_value / 100, 2)
    ELSE NEW.commission_value END;
  IF NEW.status = 'cancelled' AND coalesce(trim(NEW.cancel_reason), '') = '' THEN
    RAISE EXCEPTION 'A reason is required to cancel an LR';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS b_lr_before ON public.lrs;
CREATE TRIGGER b_lr_before BEFORE INSERT OR UPDATE ON public.lrs FOR EACH ROW EXECUTE FUNCTION public.lr_before();

CREATE OR REPLACE FUNCTION public.lr_billing_party(p_lr public.lrs)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE p_lr.freight_type
    WHEN 'paid' THEN (SELECT party_id FROM public.lr_parties WHERE lr_id = p_lr.id AND role = 'consignor' ORDER BY seq, created_at LIMIT 1)
    WHEN 'to_pay' THEN (SELECT party_id FROM public.lr_parties WHERE lr_id = p_lr.id AND role = 'consignee' ORDER BY seq, created_at LIMIT 1)
    ELSE coalesce(p_lr.billing_party_id, (SELECT party_id FROM public.lr_parties WHERE lr_id = p_lr.id AND role = 'consignor' ORDER BY seq, created_at LIMIT 1))
  END
$$;

CREATE OR REPLACE FUNCTION public.lr_after()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_bp uuid; v_active boolean := NEW.status <> 'cancelled'; v_dp numeric; v_label text := 'LR ' || NEW.lr_number;
BEGIN
  v_bp := public.lr_billing_party(NEW);
  PERFORM public.ledger_set(NEW.business_id, 'party', v_bp, 'lrs', NEW.id, 'freight', NEW.lr_date,
    'Freight ' || v_label, CASE WHEN v_active THEN NEW.final_freight ELSE 0 END, 0);
  v_dp := CASE WHEN v_active AND NEW.direct_payment_enabled THEN least(NEW.direct_payment_amount, NEW.final_freight) ELSE 0 END;
  PERFORM public.ledger_set(NEW.business_id, 'party', v_bp, 'lrs', NEW.id, 'direct_payment', NEW.lr_date,
    'Paid driver directly (' || v_label || ')', 0, v_dp);
  PERFORM public.ledger_set(NEW.business_id, 'transporter', NEW.transporter_id, 'lrs', NEW.id, 'freight_payable', NEW.lr_date,
    'Freight payable ' || v_label, 0, CASE WHEN v_active THEN NEW.freight_payable ELSE 0 END);
  PERFORM public.ledger_set(NEW.business_id, 'transporter', NEW.transporter_id, 'lrs', NEW.id, 'direct_payment', NEW.lr_date,
    'Consignee paid driver directly (' || v_label || ')', CASE WHEN v_active THEN least(v_dp, NEW.freight_payable) ELSE 0 END, 0);
  PERFORM public.ledger_set(NEW.business_id, 'commission', NEW.commission_payer_party_id, 'lrs', NEW.id, 'commission', coalesce(NEW.commission_date, NEW.lr_date),
    'Commission ' || v_label || ' (' || NEW.commission_status || ')', CASE WHEN v_active AND NEW.commission_enabled THEN NEW.commission_amount ELSE 0 END, 0);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS c_lr_after ON public.lrs;
CREATE TRIGGER c_lr_after AFTER INSERT OR UPDATE ON public.lrs FOR EACH ROW EXECUTE FUNCTION public.lr_after();

-- expenses
CREATE OR REPLACE FUNCTION public.expense_after()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.responsible = 'party' AND NEW.responsible_party_id IS NULL THEN RAISE EXCEPTION 'Choose which party is responsible for this expense'; END IF;
  PERFORM public.ledger_set(NEW.business_id, 'party', CASE WHEN NEW.responsible = 'party' THEN NEW.responsible_party_id END,
    'expenses', NEW.id, 'charged_to_party', NEW.expense_date, 'Expense charged: ' || NEW.category,
    CASE WHEN NEW.is_cancelled OR NEW.responsible <> 'party' THEN 0 ELSE NEW.amount END, 0);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS c_expense_after ON public.expenses;
CREATE TRIGGER c_expense_after AFTER INSERT OR UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.expense_after();

-- advances
CREATE OR REPLACE FUNCTION public.advance_after()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_type text; v_acct uuid; v_amt numeric := CASE WHEN NEW.is_cancelled THEN 0 ELSE NEW.amount END;
BEGIN
  IF NEW.recipient_type = 'driver' THEN v_type := 'driver'; v_acct := NEW.driver_id;
  ELSIF NEW.recipient_type = 'transporter' THEN v_type := 'transporter'; v_acct := NEW.transporter_id;
  ELSE v_type := 'party'; v_acct := NEW.party_id; END IF;
  -- if recipient type changed, zero the old line first (same key, updated below)
  PERFORM public.ledger_set(NEW.business_id, v_type, v_acct, 'advances', NEW.id, 'advance', NEW.advance_date, 'Advance paid', v_amt, 0);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS c_advance_after ON public.advances;
CREATE TRIGGER c_advance_after AFTER INSERT OR UPDATE ON public.advances FOR EACH ROW EXECUTE FUNCTION public.advance_after();

-- payments
CREATE OR REPLACE FUNCTION public.payment_before()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_bal numeric;
BEGIN
  NEW.updated_at := now();
  IF NEW.is_reversed AND coalesce(trim(NEW.reversal_reason), '') = '' THEN RAISE EXCEPTION 'A reason is required to reverse a payment'; END IF;
  IF TG_OP = 'UPDATE' AND OLD.is_reversed AND NOT NEW.is_reversed THEN RAISE EXCEPTION 'A reversed payment cannot be un-reversed. Record a new payment instead.'; END IF;
  IF NEW.payment_type = 'third_party_receipt' AND NOT NEW.is_reversed THEN
    IF NEW.party_id IS NULL THEN RAISE EXCEPTION 'Choose the original party'; END IF;
    IF coalesce(trim(NEW.payer_name), '') = '' THEN RAISE EXCEPTION 'Enter the name of the person who actually paid'; END IF;
    SELECT coalesce(sum(debit - credit), 0) INTO v_bal FROM public.ledger_entries
      WHERE account_type = 'party' AND account_id = NEW.party_id AND NOT (source_table = 'payments' AND source_id = NEW.id);
    IF NEW.amount > v_bal THEN
      RAISE EXCEPTION 'This party only owes ₹% — the amount cannot be more than that', to_char(greatest(v_bal,0), 'FM99,99,99,990.00');
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS b_payment_before ON public.payments;
CREATE TRIGGER b_payment_before BEFORE INSERT OR UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.payment_before();

CREATE OR REPLACE FUNCTION public.payment_after()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_amt numeric := CASE WHEN NEW.is_reversed THEN 0 ELSE NEW.amount END; v_desc text;
BEGIN
  v_desc := CASE NEW.payment_type
    WHEN 'customer_receipt' THEN 'Receipt'
    WHEN 'third_party_receipt' THEN 'Collected from ' || NEW.payer_name || ' on behalf of party'
    WHEN 'transporter_payment' THEN 'Payment made'
    WHEN 'advance_paid' THEN 'Advance paid'
    ELSE 'Advance received' END || coalesce(' · ' || NEW.reference, '') || CASE WHEN NEW.is_reversed THEN ' (REVERSED)' ELSE '' END;
  IF NEW.payment_type IN ('customer_receipt','third_party_receipt','advance_received') THEN
    PERFORM public.ledger_set(NEW.business_id, 'party', NEW.party_id, 'payments', NEW.id, 'payment', NEW.payment_date, v_desc, 0, v_amt);
  ELSIF NEW.transporter_id IS NOT NULL THEN
    PERFORM public.ledger_set(NEW.business_id, 'transporter', NEW.transporter_id, 'payments', NEW.id, 'payment', NEW.payment_date, v_desc, v_amt, 0);
  ELSE
    PERFORM public.ledger_set(NEW.business_id, 'party', NEW.party_id, 'payments', NEW.id, 'payment', NEW.payment_date, v_desc, v_amt, 0);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS c_payment_after ON public.payments;
CREATE TRIGGER c_payment_after AFTER INSERT OR UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.payment_after();

-- allocations: block over-allocation
CREATE OR REPLACE FUNCTION public.allocation_check()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_pay numeric; v_used numeric; v_cap numeric; v_lr_used numeric;
BEGIN
  SELECT amount INTO v_pay FROM public.payments WHERE id = NEW.payment_id;
  SELECT coalesce(sum(amount), 0) INTO v_used FROM public.payment_allocations WHERE payment_id = NEW.payment_id AND id <> NEW.id;
  IF v_used + NEW.amount > v_pay THEN RAISE EXCEPTION 'Allocated amount is more than the payment amount'; END IF;
  SELECT CASE WHEN NEW.target = 'receivable' THEN final_freight ELSE freight_payable END INTO v_cap FROM public.lrs WHERE id = NEW.lr_id;
  SELECT coalesce(sum(a.amount), 0) INTO v_lr_used FROM public.payment_allocations a JOIN public.payments p ON p.id = a.payment_id
    WHERE a.lr_id = NEW.lr_id AND a.target = NEW.target AND a.id <> NEW.id AND NOT p.is_reversed;
  IF v_lr_used + NEW.amount > v_cap THEN RAISE EXCEPTION 'This would allocate more than the LR amount (₹%)', v_cap; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS b_allocation_check ON public.payment_allocations;
CREATE TRIGGER b_allocation_check BEFORE INSERT OR UPDATE ON public.payment_allocations FOR EACH ROW EXECUTE FUNCTION public.allocation_check();

-- salary
CREATE OR REPLACE FUNCTION public.salary_entry_after()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.ledger_set(NEW.business_id, 'driver', NEW.driver_id, 'salary_entries', NEW.id, 'salary_due', coalesce(NEW.due_date, current_date),
    'Salary due ' || NEW.period, 0, CASE WHEN NEW.is_cancelled THEN 0 ELSE NEW.amount END);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS c_salary_entry_after ON public.salary_entries;
CREATE TRIGGER c_salary_entry_after AFTER INSERT OR UPDATE ON public.salary_entries FOR EACH ROW EXECUTE FUNCTION public.salary_entry_after();

CREATE OR REPLACE FUNCTION public.salary_payment_after()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.ledger_set(NEW.business_id, 'driver', NEW.driver_id, 'salary_payments', NEW.id, 'salary_paid', NEW.payment_date,
    'Salary paid' || CASE WHEN NEW.recovered_advance > 0 THEN ' (advance recovered ₹' || NEW.recovered_advance || ')' ELSE '' END,
    CASE WHEN NEW.is_reversed THEN 0 ELSE NEW.amount END, 0);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS c_salary_payment_after ON public.salary_payments;
CREATE TRIGGER c_salary_payment_after AFTER INSERT OR UPDATE ON public.salary_payments FOR EACH ROW EXECUTE FUNCTION public.salary_payment_after();

-- ===== atomic save: trip =====
CREATE OR REPLACE FUNCTION public.save_trip(p jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_id uuid := nullif(p->>'id','')::uuid; v_biz uuid := public.current_business_id(); s jsonb; v_keep uuid[] := '{}'; v_sid uuid; i int := 0;
BEGIN
  IF v_biz IS NULL THEN RAISE EXCEPTION 'No business found for the signed-in user'; END IF;
  IF v_id IS NULL THEN
    INSERT INTO public.trips(business_id, trip_number) VALUES (v_biz, '') RETURNING id INTO v_id;
  END IF;
  UPDATE public.trips SET
    trip_date = coalesce(nullif(p->>'trip_date','')::date, trip_date),
    journey_type = coalesce(nullif(p->>'journey_type',''), 'single'),
    direction = coalesce(nullif(p->>'direction',''), 'up'),
    status = coalesce(nullif(p->>'status',''), 'booked'),
    parent_trip_id = nullif(p->>'parent_trip_id','')::uuid,
    leg_label = nullif(p->>'leg_label',''),
    vehicle_mode = coalesce(nullif(p->>'vehicle_mode',''), 'own'),
    vehicle_id = CASE WHEN p->>'vehicle_mode' = 'market' THEN NULL ELSE nullif(p->>'vehicle_id','')::uuid END,
    market_vehicle_number = CASE WHEN p->>'vehicle_mode' = 'market' THEN nullif(p->>'market_vehicle_number','') END,
    market_vehicle_type = CASE WHEN p->>'vehicle_mode' = 'market' THEN nullif(p->>'market_vehicle_type','') END,
    transporter_id = nullif(p->>'transporter_id','')::uuid,
    driver_id = nullif(p->>'driver_id','')::uuid,
    driver_name = nullif(p->>'driver_name',''),
    notes = nullif(p->>'notes',''),
    cancel_reason = nullif(p->>'cancel_reason','')
  WHERE id = v_id;
  IF p ? 'stops' THEN
    FOR s IN SELECT * FROM jsonb_array_elements(p->'stops') LOOP
      i := i + 1;
      IF coalesce(trim(s->>'location'),'') = '' THEN RAISE EXCEPTION 'Stop % needs a location', i; END IF;
      v_sid := nullif(s->>'id','')::uuid;
      IF v_sid IS NULL OR NOT EXISTS (SELECT 1 FROM public.trip_stops WHERE id = v_sid AND trip_id = v_id) THEN
        INSERT INTO public.trip_stops(business_id, trip_id, location) VALUES (v_biz, v_id, s->>'location') RETURNING id INTO v_sid;
      END IF;
      UPDATE public.trip_stops SET seq = i, location = trim(s->>'location'),
        stop_type = coalesce(nullif(s->>'stop_type',''), 'intermediate'),
        planned_arrival = nullif(s->>'planned_arrival','')::timestamptz, planned_departure = nullif(s->>'planned_departure','')::timestamptz,
        actual_arrival = nullif(s->>'actual_arrival','')::timestamptz, actual_departure = nullif(s->>'actual_departure','')::timestamptz,
        status = coalesce(nullif(s->>'status',''), 'planned'), notes = nullif(s->>'notes','')
      WHERE id = v_sid;
      v_keep := v_keep || v_sid;
    END LOOP;
    IF i < 2 THEN RAISE EXCEPTION 'A trip needs at least a first stop and a last stop'; END IF;
    DELETE FROM public.trip_stops WHERE trip_id = v_id AND NOT (id = ANY(v_keep));
  END IF;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.save_trip(jsonb) TO authenticated;

-- ===== atomic save: LR =====
CREATE OR REPLACE FUNCTION public.save_lr(p jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_id uuid := nullif(p->>'id','')::uuid; v_biz uuid := public.current_business_id(); r jsonb; v_keep uuid[] := '{}'; v_pid uuid;
  i int := 0; n_cnor int := 0; n_cnee int := 0; v_eid uuid; v_keep_e uuid[] := '{}';
BEGIN
  IF v_biz IS NULL THEN RAISE EXCEPTION 'No business found for the signed-in user'; END IF;
  IF p->>'rate_unit' <> 'fixed' AND coalesce(nullif(p->>'weight','')::numeric, 0) <= 0 THEN RAISE EXCEPTION 'Enter the weight to calculate freight per kg/quintal/tonne'; END IF;
  IF nullif(p->>'rate','') IS NULL THEN RAISE EXCEPTION 'Enter the freight rate'; END IF;
  IF v_id IS NULL THEN
    INSERT INTO public.lrs(business_id, lr_number) VALUES (v_biz, coalesce(trim(p->>'lr_number'), '')) RETURNING id INTO v_id;
  ELSIF nullif(trim(p->>'lr_number'),'') IS NOT NULL THEN
    UPDATE public.lrs SET lr_number = trim(p->>'lr_number') WHERE id = v_id;
  END IF;
  -- parties
  FOR r IN SELECT * FROM jsonb_array_elements(coalesce(p->'parties','[]')) LOOP
    i := i + 1;
    IF nullif(r->>'party_id','') IS NULL THEN RAISE EXCEPTION 'Choose a party for every consignor and consignee'; END IF;
    IF r->>'role' = 'consignor' THEN n_cnor := n_cnor + 1; ELSE n_cnee := n_cnee + 1; END IF;
    v_pid := nullif(r->>'id','')::uuid;
    IF v_pid IS NULL OR NOT EXISTS (SELECT 1 FROM public.lr_parties WHERE id = v_pid AND lr_id = v_id) THEN
      INSERT INTO public.lr_parties(business_id, lr_id, role, party_id) VALUES (v_biz, v_id, r->>'role', (r->>'party_id')::uuid) RETURNING id INTO v_pid;
    END IF;
    UPDATE public.lr_parties SET role = r->>'role', party_id = (r->>'party_id')::uuid, seq = i,
      goods_description = nullif(r->>'goods_description',''), quantity = nullif(r->>'quantity','')::numeric, weight = nullif(r->>'weight','')::numeric,
      loading_point = nullif(r->>'loading_point',''), delivery_point = nullif(r->>'delivery_point','')
    WHERE id = v_pid;
    v_keep := v_keep || v_pid;
    -- expenses under this consignor/consignee
    FOR r IN SELECT * FROM jsonb_array_elements(coalesce(r->'expenses','[]')) LOOP
      v_eid := nullif(r->>'id','')::uuid;
      IF coalesce(nullif(r->>'amount','')::numeric, 0) <= 0 THEN RAISE EXCEPTION 'Every expense needs an amount greater than 0'; END IF;
      IF v_eid IS NULL OR NOT EXISTS (SELECT 1 FROM public.expenses WHERE id = v_eid AND lr_id = v_id) THEN
        INSERT INTO public.expenses(business_id, scope, lr_id, category, amount) VALUES (v_biz, 'consignor', v_id, coalesce(nullif(r->>'category',''),'Other'), (r->>'amount')::numeric) RETURNING id INTO v_eid;
      END IF;
      UPDATE public.expenses SET
        scope = (SELECT role FROM public.lr_parties WHERE id = v_pid), lr_party_id = v_pid, trip_id = nullif(p->>'trip_id','')::uuid,
        category = coalesce(nullif(r->>'category',''),'Other'), amount = (r->>'amount')::numeric,
        expense_date = coalesce(nullif(r->>'expense_date','')::date, expense_date),
        paid_by = nullif(r->>'paid_by',''), paid_to = nullif(r->>'paid_to',''),
        responsible = coalesce(nullif(r->>'responsible',''),'gokul'),
        responsible_party_id = CASE WHEN r->>'responsible' = 'party' THEN (SELECT party_id FROM public.lr_parties WHERE id = v_pid) END,
        payment_method = nullif(r->>'payment_method',''), payment_status = coalesce(nullif(r->>'payment_status',''),'paid'),
        notes = nullif(r->>'notes',''), is_cancelled = false
      WHERE id = v_eid;
      v_keep_e := v_keep_e || v_eid;
    END LOOP;
  END LOOP;
  IF n_cnor = 0 OR n_cnee = 0 THEN RAISE EXCEPTION 'Add at least one consignor and one consignee'; END IF;
  -- removed expenses are cancelled (never deleted)
  UPDATE public.expenses SET is_cancelled = true, cancel_reason = 'Removed from LR'
    WHERE lr_id = v_id AND scope IN ('consignor','consignee') AND NOT is_cancelled AND NOT (id = ANY(v_keep_e));
  DELETE FROM public.lr_parties WHERE lr_id = v_id AND NOT (id = ANY(v_keep));
  -- adjustments: replace (totals are recomputed, never applied twice)
  DELETE FROM public.lr_adjustments WHERE lr_id = v_id;
  FOR r IN SELECT * FROM jsonb_array_elements(coalesce(p->'adjustments','[]')) LOOP
    IF coalesce(trim(r->>'reason'),'') = '' THEN RAISE EXCEPTION 'Every addition/deduction needs a reason'; END IF;
    INSERT INTO public.lr_adjustments(business_id, lr_id, kind, amount, reason) VALUES (v_biz, v_id, r->>'kind', (r->>'amount')::numeric, trim(r->>'reason'));
  END LOOP;
  UPDATE public.lrs SET
    lr_date = coalesce(nullif(p->>'lr_date','')::date, lr_date),
    trip_id = nullif(p->>'trip_id','')::uuid,
    loading_stop_id = CASE WHEN nullif(p->>'trip_id','') IS NULL THEN NULL ELSE nullif(p->>'loading_stop_id','')::uuid END,
    unloading_stop_id = CASE WHEN nullif(p->>'trip_id','') IS NULL THEN NULL ELSE nullif(p->>'unloading_stop_id','')::uuid END,
    goods_description = nullif(p->>'goods_description',''), quantity = nullif(p->>'quantity','')::numeric,
    weight = nullif(p->>'weight','')::numeric, weight_unit = coalesce(nullif(p->>'weight_unit',''),'kg'),
    loading_point = nullif(p->>'loading_point',''), delivery_point = nullif(p->>'delivery_point',''), notes = nullif(p->>'notes',''),
    delivery_status = coalesce(nullif(p->>'delivery_status',''),'pending'),
    freight_type = coalesce(nullif(p->>'freight_type',''),'to_pay'), billing_party_id = nullif(p->>'billing_party_id','')::uuid,
    rate_unit = coalesce(nullif(p->>'rate_unit',''),'fixed'), rate = nullif(p->>'rate','')::numeric,
    transporter_id = nullif(p->>'transporter_id','')::uuid, vehicle_number = nullif(p->>'vehicle_number',''),
    vehicle_type = nullif(p->>'vehicle_type',''), driver_name = nullif(p->>'driver_name',''),
    freight_payable = coalesce(nullif(p->>'freight_payable','')::numeric, 0),
    direct_payment_enabled = coalesce((p->>'direct_payment_enabled')::boolean, false),
    direct_payment_amount = CASE WHEN coalesce((p->>'direct_payment_enabled')::boolean,false) THEN coalesce(nullif(p->>'direct_payment_amount','')::numeric,0) ELSE 0 END,
    commission_enabled = coalesce((p->>'commission_enabled')::boolean, false),
    commission_mode = coalesce(nullif(p->>'commission_mode',''),'fixed'),
    commission_value = coalesce(nullif(p->>'commission_value','')::numeric, 0),
    commission_payer_party_id = CASE WHEN coalesce((p->>'commission_enabled')::boolean,false) THEN
      coalesce(nullif(p->>'commission_payer_party_id','')::uuid, (SELECT party_id FROM public.lr_parties WHERE lr_id = v_id AND role='consignee' ORDER BY seq LIMIT 1)) END,
    commission_status = coalesce(nullif(p->>'commission_status',''),'pending'),
    commission_date = nullif(p->>'commission_date','')::date, commission_reference = nullif(p->>'commission_reference',''),
    commission_notes = nullif(p->>'commission_notes','')
  WHERE id = v_id;
  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.save_lr(jsonb) TO authenticated;

-- signup approvals: list members-less users is done server-side
