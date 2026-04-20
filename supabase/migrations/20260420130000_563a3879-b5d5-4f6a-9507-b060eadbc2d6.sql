
-- ============================================================
-- LAYER 1: Tighten leaky SELECT policies on 5 finance tables
-- ============================================================

-- agency_accounts
DROP POLICY IF EXISTS "client_read_active_agency_accounts" ON public.agency_accounts;
DROP POLICY IF EXISTS "manager_finance_read_agency_accounts" ON public.agency_accounts;

CREATE POLICY "client_read_org_agency_accounts" ON public.agency_accounts
  FOR SELECT
  USING (
    has_role(auth.uid(), 'client'::app_role)
    AND is_active = true
    AND org_id = get_user_org_id(auth.uid())
  );

CREATE POLICY "manager_finance_read_org_agency_accounts" ON public.agency_accounts
  FOR SELECT
  USING (
    has_role(auth.uid(), 'manager'::app_role)
    AND has_permission(auth.uid(), 'can_manage_finance'::text)
    AND org_id = get_user_org_id(auth.uid())
  );

-- agency_expenses
DROP POLICY IF EXISTS "manager_finance_agency_expenses" ON public.agency_expenses;

CREATE POLICY "manager_finance_read_org_agency_expenses" ON public.agency_expenses
  FOR SELECT
  USING (
    has_role(auth.uid(), 'manager'::app_role)
    AND has_permission(auth.uid(), 'can_manage_finance'::text)
    AND org_id = get_user_org_id(auth.uid())
  );

-- cash_withdrawals
DROP POLICY IF EXISTS "manager_finance_read_cash_withdrawals" ON public.cash_withdrawals;

CREATE POLICY "manager_finance_read_org_cash_withdrawals" ON public.cash_withdrawals
  FOR SELECT
  USING (
    has_role(auth.uid(), 'manager'::app_role)
    AND has_permission(auth.uid(), 'can_manage_finance'::text)
    AND org_id = get_user_org_id(auth.uid())
  );

-- cash_withdrawal_returns
DROP POLICY IF EXISTS "manager_finance_read_cash_withdrawal_returns" ON public.cash_withdrawal_returns;

CREATE POLICY "manager_finance_read_org_cash_withdrawal_returns" ON public.cash_withdrawal_returns
  FOR SELECT
  USING (
    has_role(auth.uid(), 'manager'::app_role)
    AND has_permission(auth.uid(), 'can_manage_finance'::text)
    AND org_id = get_user_org_id(auth.uid())
  );

-- fund_transfers
DROP POLICY IF EXISTS "manager_finance_read_fund_transfers" ON public.fund_transfers;

CREATE POLICY "manager_finance_read_org_fund_transfers" ON public.fund_transfers
  FOR SELECT
  USING (
    has_role(auth.uid(), 'manager'::app_role)
    AND has_permission(auth.uid(), 'can_manage_finance'::text)
    AND org_id = get_user_org_id(auth.uid())
  );

-- ============================================================
-- LAYER 2: Restrict settings table reads
-- ============================================================
DROP POLICY IF EXISTS "anon_read_settings" ON public.settings;
DROP POLICY IF EXISTS "read_settings" ON public.settings;

CREATE POLICY "authenticated_read_settings" ON public.settings
  FOR SELECT
  TO authenticated
  USING (true);

-- Anon access only for keys public signup pages need
CREATE POLICY "anon_read_signup_settings" ON public.settings
  FOR SELECT
  TO anon
  USING (key IN ('trial_on_self_signup', 'default_trial_days', 'default_grace_period_days'));

-- ============================================================
-- LAYER 3: Harden org_id assignment triggers (no silent fallback)
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_org_id_from_auth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.org_id IS NULL THEN
    NEW.org_id := get_user_org_id(auth.uid());
  END IF;
  IF NEW.org_id IS NULL THEN
    RAISE EXCEPTION 'org_id required: pass it explicitly when inserting from service role (table %)', TG_TABLE_NAME;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_org_id_safety_net()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.org_id IS NULL THEN
    NEW.org_id := get_user_org_id(auth.uid());
  END IF;
  IF NEW.org_id IS NULL THEN
    RAISE EXCEPTION 'org_id required: pass it explicitly when inserting from service role (table %)', TG_TABLE_NAME;
  END IF;
  RETURN NEW;
END;
$function$;
