
-- Create invoice status enum
CREATE TYPE public.invoice_status AS ENUM ('draft', 'sent', 'paid', 'overdue', 'void');

-- Create announcement type enum
CREATE TYPE public.announcement_type AS ENUM ('info', 'warning', 'maintenance');

-- Platform Plans table (dynamic plan definitions)
CREATE TABLE public.platform_plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  key TEXT NOT NULL UNIQUE,
  price_bdt_monthly NUMERIC NOT NULL DEFAULT 0,
  price_bdt_yearly NUMERIC NOT NULL DEFAULT 0,
  max_clients INTEGER NOT NULL DEFAULT 5,
  max_ad_accounts INTEGER NOT NULL DEFAULT 10,
  max_managers INTEGER NOT NULL DEFAULT 2,
  features JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_popular BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_owner_all_platform_plans" ON public.platform_plans
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'platform_owner'::app_role))
  WITH CHECK (has_role(auth.uid(), 'platform_owner'::app_role));

CREATE POLICY "anyone_read_active_plans" ON public.platform_plans
  FOR SELECT TO authenticated
  USING (is_active = true);

-- Platform Invoices table
CREATE TABLE public.platform_invoices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  invoice_number TEXT NOT NULL UNIQUE,
  amount_bdt NUMERIC NOT NULL DEFAULT 0,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status invoice_status NOT NULL DEFAULT 'draft',
  payment_date DATE,
  payment_method TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_owner_all_invoices" ON public.platform_invoices
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'platform_owner'::app_role))
  WITH CHECK (has_role(auth.uid(), 'platform_owner'::app_role));

CREATE POLICY "org_admin_read_own_invoices" ON public.platform_invoices
  FOR SELECT TO authenticated
  USING (org_id = get_user_org_id(auth.uid()));

-- Platform Announcements table
CREATE TABLE public.platform_announcements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  type announcement_type NOT NULL DEFAULT 'info',
  target_plan TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_owner_all_announcements" ON public.platform_announcements
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'platform_owner'::app_role))
  WITH CHECK (has_role(auth.uid(), 'platform_owner'::app_role));

CREATE POLICY "authenticated_read_active_announcements" ON public.platform_announcements
  FOR SELECT TO authenticated
  USING (is_active = true AND starts_at <= now() AND (ends_at IS NULL OR ends_at > now()));

-- Add suspension_reason and notes to organizations
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS suspension_reason TEXT;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS notes TEXT;

-- Add platform_owner read policy for audit_logs
CREATE POLICY "platform_owner_read_audit_logs" ON public.audit_logs
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'platform_owner'::app_role));

-- Seed default plans
INSERT INTO public.platform_plans (name, key, price_bdt_monthly, price_bdt_yearly, max_clients, max_ad_accounts, max_managers, features, is_popular, sort_order) VALUES
  ('Starter', 'starter', 2999, 29990, 5, 10, 2, '["5 Clients", "10 Ad Accounts", "2 Team Members", "Basic Analytics"]'::jsonb, false, 1),
  ('Growth', 'growth', 5999, 59990, 20, 50, 5, '["20 Clients", "50 Ad Accounts", "5 Team Members", "Advanced Analytics", "Priority Support"]'::jsonb, true, 2),
  ('Agency Pro', 'agency_pro', 11999, 119990, 100, 200, 20, '["100 Clients", "200 Ad Accounts", "20 Team Members", "Full Analytics", "Dedicated Support", "API Access", "White Label"]'::jsonb, false, 3);
