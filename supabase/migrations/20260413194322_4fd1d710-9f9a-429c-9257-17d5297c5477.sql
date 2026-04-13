
-- 1. Backfill daily_metrics: get org_id from campaigns table
UPDATE public.daily_metrics dm
SET org_id = c.org_id
FROM public.campaigns c
WHERE dm.campaign_id = c.id
  AND dm.org_id IS NULL
  AND c.org_id IS NOT NULL;

-- 2. Backfill campaign_performance: get org_id from ad_accounts table
UPDATE public.campaign_performance cp
SET org_id = aa.org_id
FROM public.ad_accounts aa
WHERE cp.ad_account_id = aa.id
  AND cp.org_id IS NULL
  AND aa.org_id IS NOT NULL;

-- 3. Backfill daily_ad_spend: get org_id from ad_accounts table
UPDATE public.daily_ad_spend das
SET org_id = aa.org_id
FROM public.ad_accounts aa
WHERE das.ad_account_id = aa.id
  AND das.org_id IS NULL
  AND aa.org_id IS NOT NULL;

-- 4. Safety trigger for daily_metrics
CREATE OR REPLACE FUNCTION public.set_org_id_from_campaign()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.org_id IS NULL AND NEW.campaign_id IS NOT NULL THEN
    SELECT org_id INTO NEW.org_id
    FROM public.campaigns
    WHERE id = NEW.campaign_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_daily_metrics_set_org_id
  BEFORE INSERT OR UPDATE ON public.daily_metrics
  FOR EACH ROW
  EXECUTE FUNCTION public.set_org_id_from_campaign();

-- 5. Safety trigger for campaign_performance (uses ad_account_id)
CREATE OR REPLACE FUNCTION public.set_org_id_from_ad_account()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.org_id IS NULL AND NEW.ad_account_id IS NOT NULL THEN
    SELECT org_id INTO NEW.org_id
    FROM public.ad_accounts
    WHERE id = NEW.ad_account_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_campaign_performance_set_org_id
  BEFORE INSERT OR UPDATE ON public.campaign_performance
  FOR EACH ROW
  EXECUTE FUNCTION public.set_org_id_from_ad_account();

-- 6. Safety trigger for daily_ad_spend (also uses ad_account_id)
CREATE TRIGGER trg_daily_ad_spend_set_org_id
  BEFORE INSERT OR UPDATE ON public.daily_ad_spend
  FOR EACH ROW
  EXECUTE FUNCTION public.set_org_id_from_ad_account();
