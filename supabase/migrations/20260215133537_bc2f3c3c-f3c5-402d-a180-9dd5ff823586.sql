
-- Create currency enum
CREATE TYPE public.account_currency AS ENUM ('USD', 'BDT');

-- Ad accounts table
CREATE TABLE public.ad_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  platform_name public.ad_platform NOT NULL,
  ad_account_id text NOT NULL,
  account_currency public.account_currency NOT NULL DEFAULT 'USD',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ad_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_ad_accounts" ON public.ad_accounts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "manager_read_ad_accounts" ON public.ad_accounts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'manager') AND client_id IN (SELECT public.get_managed_client_ids(auth.uid())));

CREATE POLICY "client_read_own_ad_accounts" ON public.ad_accounts FOR SELECT TO authenticated
  USING (client_id = auth.uid());

-- Daily ad spend table
CREATE TABLE public.daily_ad_spend (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_account_id uuid NOT NULL REFERENCES public.ad_accounts(id) ON DELETE CASCADE,
  date date NOT NULL DEFAULT CURRENT_DATE,
  campaign_name text NOT NULL DEFAULT '',
  raw_spend_amount numeric NOT NULL DEFAULT 0,
  raw_currency public.account_currency NOT NULL DEFAULT 'USD',
  exchange_rate_used numeric NOT NULL DEFAULT 1,
  final_billable_usd numeric NOT NULL DEFAULT 0,
  synced_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.daily_ad_spend ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_daily_ad_spend" ON public.daily_ad_spend FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "manager_read_daily_ad_spend" ON public.daily_ad_spend FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'manager')
    AND ad_account_id IN (
      SELECT a.id FROM public.ad_accounts a WHERE a.client_id IN (SELECT public.get_managed_client_ids(auth.uid()))
    )
  );

CREATE POLICY "client_read_own_daily_ad_spend" ON public.daily_ad_spend FOR SELECT TO authenticated
  USING (
    ad_account_id IN (SELECT a.id FROM public.ad_accounts a WHERE a.client_id = auth.uid())
  );

-- API integrations table (admin-only)
CREATE TABLE public.api_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform public.ad_platform NOT NULL,
  api_token text NOT NULL DEFAULT '',
  app_id text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  last_synced_at timestamptz,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.api_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_api_integrations" ON public.api_integrations FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Campaign mappings table
CREATE TABLE public.campaign_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id text NOT NULL,
  campaign_name text NOT NULL,
  platform public.ad_platform NOT NULL,
  client_id uuid,
  ad_account_id uuid REFERENCES public.ad_accounts(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.campaign_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_campaign_mappings" ON public.campaign_mappings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "manager_read_campaign_mappings" ON public.campaign_mappings FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'manager')
    AND client_id IN (SELECT public.get_managed_client_ids(auth.uid()))
  );

CREATE POLICY "client_read_own_campaign_mappings" ON public.campaign_mappings FOR SELECT TO authenticated
  USING (client_id = auth.uid());

-- Normalize spend database function
CREATE OR REPLACE FUNCTION public.normalize_spend(raw_amount numeric, raw_currency text, rate numeric)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN raw_currency = 'BDT' THEN ROUND(raw_amount / NULLIF(rate, 0), 2)
    ELSE raw_amount
  END
$$;

-- Insert service_margin_percentage setting
INSERT INTO public.settings (key, value) VALUES ('service_margin_percentage', '0') ON CONFLICT DO NOTHING;
