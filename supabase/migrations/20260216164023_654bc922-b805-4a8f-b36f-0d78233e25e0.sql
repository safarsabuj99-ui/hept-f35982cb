
-- 1. Create campaign_performance table
CREATE TABLE public.campaign_performance (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id text NOT NULL,
  campaign_name text NOT NULL DEFAULT '',
  ad_account_id uuid NOT NULL REFERENCES public.ad_accounts(id) ON DELETE CASCADE,
  client_id uuid,
  date date NOT NULL DEFAULT CURRENT_DATE,
  impressions bigint NOT NULL DEFAULT 0,
  clicks bigint NOT NULL DEFAULT 0,
  ctr numeric NOT NULL DEFAULT 0,
  cpc numeric NOT NULL DEFAULT 0,
  roas numeric NOT NULL DEFAULT 0,
  spend numeric NOT NULL DEFAULT 0,
  synced_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Enable RLS
ALTER TABLE public.campaign_performance ENABLE ROW LEVEL SECURITY;

-- 3. RLS Policies
CREATE POLICY "admin_all_campaign_performance"
  ON public.campaign_performance FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "client_read_own_campaign_performance"
  ON public.campaign_performance FOR SELECT
  USING (ad_account_id IN (
    SELECT aac.ad_account_id FROM ad_account_clients aac WHERE aac.client_id = auth.uid()
  ));

CREATE POLICY "manager_read_campaign_performance"
  ON public.campaign_performance FOR SELECT
  USING (
    has_role(auth.uid(), 'manager'::app_role) AND
    ad_account_id IN (
      SELECT aac.ad_account_id FROM ad_account_clients aac
      WHERE aac.client_id IN (SELECT get_managed_client_ids(auth.uid()))
    )
  );

-- 4. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_campaign_mappings_client_id ON public.campaign_mappings(client_id);
CREATE INDEX IF NOT EXISTS idx_daily_ad_spend_account_date ON public.daily_ad_spend(ad_account_id, date);
CREATE INDEX IF NOT EXISTS idx_campaign_perf_campaign_date ON public.campaign_performance(campaign_id, date);
CREATE INDEX IF NOT EXISTS idx_transactions_client_status ON public.transactions(client_id, status);

-- 5. Enable Realtime for campaign_performance only (others already enabled)
ALTER PUBLICATION supabase_realtime ADD TABLE public.campaign_performance;
