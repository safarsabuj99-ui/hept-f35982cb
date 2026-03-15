
-- 1. Add client_id column to daily_ad_spend
ALTER TABLE public.daily_ad_spend ADD COLUMN client_id uuid;

-- 2. Backfill client_id from ad_account_clients keyword matching
UPDATE public.daily_ad_spend das
SET client_id = aac.client_id
FROM public.ad_account_clients aac
WHERE das.ad_account_id = aac.ad_account_id
  AND aac.mapping_keyword != ''
  AND LOWER(das.campaign_name) LIKE '%' || LOWER(TRIM(aac.mapping_keyword)) || '%'
  AND das.client_id IS NULL;

-- 3. Drop old client policies on campaigns
DROP POLICY IF EXISTS "client_read_own_campaigns" ON public.campaigns;
DROP POLICY IF EXISTS "manager_read_campaigns" ON public.campaigns;

-- 4. New campaigns policies using client_id directly
CREATE POLICY "client_read_own_campaigns" ON public.campaigns
  FOR SELECT TO public
  USING (client_id = auth.uid());

CREATE POLICY "manager_read_campaigns" ON public.campaigns
  FOR SELECT TO public
  USING (
    has_role(auth.uid(), 'manager'::app_role)
    AND client_id IN (SELECT get_managed_client_ids(auth.uid()))
  );

-- 5. Drop old client policies on campaign_performance
DROP POLICY IF EXISTS "client_read_own_campaign_performance" ON public.campaign_performance;
DROP POLICY IF EXISTS "manager_read_campaign_performance" ON public.campaign_performance;

-- 6. New campaign_performance policies using client_id directly
CREATE POLICY "client_read_own_campaign_performance" ON public.campaign_performance
  FOR SELECT TO public
  USING (client_id = auth.uid());

CREATE POLICY "manager_read_campaign_performance" ON public.campaign_performance
  FOR SELECT TO public
  USING (
    has_role(auth.uid(), 'manager'::app_role)
    AND client_id IN (SELECT get_managed_client_ids(auth.uid()))
  );

-- 7. Drop old client policies on daily_metrics
DROP POLICY IF EXISTS "client_read_own_daily_metrics" ON public.daily_metrics;
DROP POLICY IF EXISTS "manager_read_daily_metrics" ON public.daily_metrics;

-- 8. New daily_metrics policies using campaigns.client_id
CREATE POLICY "client_read_own_daily_metrics" ON public.daily_metrics
  FOR SELECT TO public
  USING (
    campaign_id IN (SELECT c.id FROM public.campaigns c WHERE c.client_id = auth.uid())
  );

CREATE POLICY "manager_read_daily_metrics" ON public.daily_metrics
  FOR SELECT TO public
  USING (
    has_role(auth.uid(), 'manager'::app_role)
    AND campaign_id IN (
      SELECT c.id FROM public.campaigns c
      WHERE c.client_id IN (SELECT get_managed_client_ids(auth.uid()))
    )
  );

-- 9. Drop old client policies on daily_ad_spend
DROP POLICY IF EXISTS "client_read_own_daily_ad_spend" ON public.daily_ad_spend;
DROP POLICY IF EXISTS "manager_read_daily_ad_spend" ON public.daily_ad_spend;

-- 10. New daily_ad_spend policies using client_id directly
CREATE POLICY "client_read_own_daily_ad_spend" ON public.daily_ad_spend
  FOR SELECT TO public
  USING (client_id = auth.uid());

CREATE POLICY "manager_read_daily_ad_spend" ON public.daily_ad_spend
  FOR SELECT TO public
  USING (
    has_role(auth.uid(), 'manager'::app_role)
    AND client_id IN (SELECT get_managed_client_ids(auth.uid()))
  );
