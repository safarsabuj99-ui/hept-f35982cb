
-- Part 1A: Add columns to profiles table for client sync config
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ad_account_filter_tag text,
  ADD COLUMN IF NOT EXISTS data_fetch_start_date date,
  ADD COLUMN IF NOT EXISTS preferred_timezone text NOT NULL DEFAULT 'Asia/Dhaka';

-- Part 1B: Create campaigns table (parent identity store)
CREATE TABLE public.campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_id text NOT NULL,
  name text NOT NULL DEFAULT '',
  original_name_tag text NOT NULL DEFAULT '',
  platform public.ad_platform NOT NULL,
  status text NOT NULL DEFAULT 'active',
  ad_account_id uuid NOT NULL REFERENCES public.ad_accounts(id) ON DELETE CASCADE,
  client_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_campaigns_platform_id UNIQUE (platform_id)
);

-- Part 1C: Create daily_metrics table (child data)
CREATE TABLE public.daily_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  data_date date NOT NULL,
  spend numeric NOT NULL DEFAULT 0,
  impressions bigint NOT NULL DEFAULT 0,
  clicks bigint NOT NULL DEFAULT 0,
  results integer NOT NULL DEFAULT 0,
  conversion_value numeric NOT NULL DEFAULT 0,
  ctr numeric NOT NULL DEFAULT 0,
  cpc numeric NOT NULL DEFAULT 0,
  roas numeric NOT NULL DEFAULT 0,
  synced_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_daily_metrics_campaign_date UNIQUE (campaign_id, data_date)
);

-- Indexes for performance
CREATE INDEX idx_campaigns_ad_account_id ON public.campaigns(ad_account_id);
CREATE INDEX idx_campaigns_client_id ON public.campaigns(client_id);
CREATE INDEX idx_daily_metrics_campaign_id ON public.daily_metrics(campaign_id);
CREATE INDEX idx_daily_metrics_data_date ON public.daily_metrics(data_date);

-- Trigger for campaigns updated_at
CREATE TRIGGER update_campaigns_updated_at
  BEFORE UPDATE ON public.campaigns
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- RLS for campaigns
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_campaigns"
  ON public.campaigns FOR ALL
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "client_read_own_campaigns"
  ON public.campaigns FOR SELECT
  USING (ad_account_id IN (
    SELECT aac.ad_account_id FROM ad_account_clients aac WHERE aac.client_id = auth.uid()
  ));

CREATE POLICY "manager_read_campaigns"
  ON public.campaigns FOR SELECT
  USING (
    has_role(auth.uid(), 'manager') AND
    ad_account_id IN (
      SELECT aac.ad_account_id FROM ad_account_clients aac
      WHERE aac.client_id IN (SELECT get_managed_client_ids(auth.uid()))
    )
  );

-- RLS for daily_metrics
ALTER TABLE public.daily_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_daily_metrics"
  ON public.daily_metrics FOR ALL
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "client_read_own_daily_metrics"
  ON public.daily_metrics FOR SELECT
  USING (campaign_id IN (
    SELECT c.id FROM campaigns c
    JOIN ad_account_clients aac ON aac.ad_account_id = c.ad_account_id
    WHERE aac.client_id = auth.uid()
  ));

CREATE POLICY "manager_read_daily_metrics"
  ON public.daily_metrics FOR SELECT
  USING (
    has_role(auth.uid(), 'manager') AND
    campaign_id IN (
      SELECT c.id FROM campaigns c
      JOIN ad_account_clients aac ON aac.ad_account_id = c.ad_account_id
      WHERE aac.client_id IN (SELECT get_managed_client_ids(auth.uid()))
    )
  );
