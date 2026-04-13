
-- ============================================================
-- 1. SHARED TRIGGER FUNCTIONS (reusable across table groups)
-- ============================================================

-- A) User-based: auth.uid() → user_id → profiles → first org
CREATE OR REPLACE FUNCTION public.set_org_id_from_user_generic()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.org_id IS NULL THEN
    NEW.org_id := get_user_org_id(auth.uid());
  END IF;
  IF NEW.org_id IS NULL AND TG_ARGV[0] IS NOT NULL THEN
    EXECUTE format('SELECT org_id FROM public.profiles WHERE user_id = ($1).%I LIMIT 1', TG_ARGV[0])
      INTO NEW.org_id USING NEW;
  END IF;
  IF NEW.org_id IS NULL THEN
    SELECT id INTO NEW.org_id FROM public.organizations LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

-- B) Subscription-based: org_id from subscription_id → organization_subscriptions
CREATE OR REPLACE FUNCTION public.set_org_id_from_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.org_id IS NULL THEN
    NEW.org_id := get_user_org_id(auth.uid());
  END IF;
  IF NEW.org_id IS NULL AND NEW.subscription_id IS NOT NULL THEN
    SELECT org_id INTO NEW.org_id FROM public.organization_subscriptions WHERE id = NEW.subscription_id;
  END IF;
  IF NEW.org_id IS NULL THEN
    SELECT id INTO NEW.org_id FROM public.organizations LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

-- C) Safety-net: just auth.uid() → first org (for tables that already get org_id in payload)
CREATE OR REPLACE FUNCTION public.set_org_id_safety_net()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.org_id IS NULL THEN
    NEW.org_id := get_user_org_id(auth.uid());
  END IF;
  IF NEW.org_id IS NULL THEN
    SELECT id INTO NEW.org_id FROM public.organizations LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

-- ============================================================
-- 2. USER-BASED TRIGGERS (10 tables)
-- ============================================================

-- api_integrations (has updated_by column)
CREATE OR REPLACE TRIGGER trg_set_org_id_api_integrations
  BEFORE INSERT ON public.api_integrations
  FOR EACH ROW EXECUTE FUNCTION public.set_org_id_from_user_generic('updated_by');

-- subscription_payments (has user_id)
CREATE OR REPLACE TRIGGER trg_set_org_id_subscription_payments
  BEFORE INSERT ON public.subscription_payments
  FOR EACH ROW EXECUTE FUNCTION public.set_org_id_from_user_generic('user_id');

-- plan_upgrade_requests (no user column, auth.uid() only)
CREATE OR REPLACE TRIGGER trg_set_org_id_plan_upgrade_requests
  BEFORE INSERT ON public.plan_upgrade_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_org_id_safety_net();

-- document_acceptances (has user_id)
CREATE OR REPLACE TRIGGER trg_set_org_id_document_acceptances
  BEFORE INSERT ON public.document_acceptances
  FOR EACH ROW EXECUTE FUNCTION public.set_org_id_from_user_generic('user_id');

-- support_tickets (has created_by)
CREATE OR REPLACE TRIGGER trg_set_org_id_support_tickets
  BEFORE INSERT ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.set_org_id_from_user_generic('created_by');

-- payment_gateway_config (no user column)
CREATE OR REPLACE TRIGGER trg_set_org_id_payment_gateway_config
  BEFORE INSERT ON public.payment_gateway_config
  FOR EACH ROW EXECUTE FUNCTION public.set_org_id_safety_net();

-- acquisition_costs (no user column)
CREATE OR REPLACE TRIGGER trg_set_org_id_acquisition_costs
  BEFORE INSERT ON public.acquisition_costs
  FOR EACH ROW EXECUTE FUNCTION public.set_org_id_safety_net();

-- platform_costs (no user column)
CREATE OR REPLACE TRIGGER trg_set_org_id_platform_costs
  BEFORE INSERT ON public.platform_costs
  FOR EACH ROW EXECUTE FUNCTION public.set_org_id_safety_net();

-- referral_codes (no user column)
CREATE OR REPLACE TRIGGER trg_set_org_id_referral_codes
  BEFORE INSERT ON public.referral_codes
  FOR EACH ROW EXECUTE FUNCTION public.set_org_id_safety_net();

-- email_log (has user_id)
CREATE OR REPLACE TRIGGER trg_set_org_id_email_log
  BEFORE INSERT ON public.email_log
  FOR EACH ROW EXECUTE FUNCTION public.set_org_id_from_user_generic('user_id');

-- ============================================================
-- 3. SUBSCRIPTION-BASED TRIGGERS (3 tables)
-- ============================================================

-- organization_subscriptions (org_id is direct, safety net)
CREATE OR REPLACE TRIGGER trg_set_org_id_organization_subscriptions
  BEFORE INSERT ON public.organization_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_org_id_safety_net();

-- dunning_runs (has subscription_id)
CREATE OR REPLACE TRIGGER trg_set_org_id_dunning_runs
  BEFORE INSERT ON public.dunning_runs
  FOR EACH ROW EXECUTE FUNCTION public.set_org_id_from_subscription();

-- gateway_transactions (has subscription_id)
CREATE OR REPLACE TRIGGER trg_set_org_id_gateway_transactions
  BEFORE INSERT ON public.gateway_transactions
  FOR EACH ROW EXECUTE FUNCTION public.set_org_id_from_subscription();

-- ============================================================
-- 4. SAFETY-NET TRIGGERS (8 tables — already get org_id in payload)
-- ============================================================

CREATE OR REPLACE TRIGGER trg_set_org_id_plan_change_log
  BEFORE INSERT ON public.plan_change_log
  FOR EACH ROW EXECUTE FUNCTION public.set_org_id_safety_net();

CREATE OR REPLACE TRIGGER trg_set_org_id_platform_invoices
  BEFORE INSERT ON public.platform_invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_org_id_safety_net();

CREATE OR REPLACE TRIGGER trg_set_org_id_overage_charges
  BEFORE INSERT ON public.overage_charges
  FOR EACH ROW EXECUTE FUNCTION public.set_org_id_safety_net();

CREATE OR REPLACE TRIGGER trg_set_org_id_sla_metrics
  BEFORE INSERT ON public.sla_metrics
  FOR EACH ROW EXECUTE FUNCTION public.set_org_id_safety_net();

CREATE OR REPLACE TRIGGER trg_set_org_id_feature_usage_events
  BEFORE INSERT ON public.feature_usage_events
  FOR EACH ROW EXECUTE FUNCTION public.set_org_id_safety_net();

CREATE OR REPLACE TRIGGER trg_set_org_id_tenant_health_scores
  BEFORE INSERT ON public.tenant_health_scores
  FOR EACH ROW EXECUTE FUNCTION public.set_org_id_safety_net();

CREATE OR REPLACE TRIGGER trg_set_org_id_usage_metering_logs
  BEFORE INSERT ON public.usage_metering_logs
  FOR EACH ROW EXECUTE FUNCTION public.set_org_id_safety_net();

CREATE OR REPLACE TRIGGER trg_set_org_id_data_export_requests
  BEFORE INSERT ON public.data_export_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_org_id_safety_net();
