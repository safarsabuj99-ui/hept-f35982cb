
-- ============================================================
-- Phase 1: Ad Set + Ad hierarchy tables (mirror campaigns + daily_metrics)
-- ============================================================

-- ---------- AD_SETS ----------
CREATE TABLE public.ad_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_id text NOT NULL,
  name text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active',
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  ad_account_id uuid NOT NULL REFERENCES public.ad_accounts(id) ON DELETE CASCADE,
  client_id uuid,
  org_id uuid REFERENCES public.organizations(id),
  budget numeric NOT NULL DEFAULT 0,
  optimization_goal text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_ad_sets_account_platform UNIQUE (ad_account_id, platform_id)
);

CREATE INDEX idx_ad_sets_campaign_id ON public.ad_sets(campaign_id);
CREATE INDEX idx_ad_sets_ad_account_id ON public.ad_sets(ad_account_id);
CREATE INDEX idx_ad_sets_client_id ON public.ad_sets(client_id);
CREATE INDEX idx_ad_sets_org_id ON public.ad_sets(org_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ad_sets TO authenticated;
GRANT ALL ON public.ad_sets TO service_role;
ALTER TABLE public.ad_sets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_ad_sets" ON public.ad_sets
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) AND (org_id = get_user_org_id(auth.uid())))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND (org_id = get_user_org_id(auth.uid())));

CREATE POLICY "client_read_own_ad_sets" ON public.ad_sets FOR SELECT
  USING (client_id = auth.uid());

CREATE POLICY "manager_read_ad_sets" ON public.ad_sets FOR SELECT
  USING (has_role(auth.uid(), 'manager'::app_role)
         AND client_id IN (SELECT get_managed_client_ids(auth.uid())));

CREATE TRIGGER update_ad_sets_updated_at
  BEFORE UPDATE ON public.ad_sets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- ADS ----------
CREATE TABLE public.ads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_id text NOT NULL,
  name text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active',
  ad_set_id uuid NOT NULL REFERENCES public.ad_sets(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  ad_account_id uuid NOT NULL REFERENCES public.ad_accounts(id) ON DELETE CASCADE,
  client_id uuid,
  org_id uuid REFERENCES public.organizations(id),
  creative_thumb_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_ads_account_platform UNIQUE (ad_account_id, platform_id)
);

CREATE INDEX idx_ads_ad_set_id ON public.ads(ad_set_id);
CREATE INDEX idx_ads_campaign_id ON public.ads(campaign_id);
CREATE INDEX idx_ads_ad_account_id ON public.ads(ad_account_id);
CREATE INDEX idx_ads_client_id ON public.ads(client_id);
CREATE INDEX idx_ads_org_id ON public.ads(org_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ads TO authenticated;
GRANT ALL ON public.ads TO service_role;
ALTER TABLE public.ads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_ads" ON public.ads
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) AND (org_id = get_user_org_id(auth.uid())))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND (org_id = get_user_org_id(auth.uid())));

CREATE POLICY "client_read_own_ads" ON public.ads FOR SELECT
  USING (client_id = auth.uid());

CREATE POLICY "manager_read_ads" ON public.ads FOR SELECT
  USING (has_role(auth.uid(), 'manager'::app_role)
         AND client_id IN (SELECT get_managed_client_ids(auth.uid())));

CREATE TRIGGER update_ads_updated_at
  BEFORE UPDATE ON public.ads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- DAILY_METRICS_ADSET ----------
CREATE TABLE public.daily_metrics_adset (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_set_id uuid NOT NULL REFERENCES public.ad_sets(id) ON DELETE CASCADE,
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
  view_content integer NOT NULL DEFAULT 0,
  add_to_cart integer NOT NULL DEFAULT 0,
  initiate_checkout integer NOT NULL DEFAULT 0,
  purchase integer NOT NULL DEFAULT 0,
  messaging_conversations integer NOT NULL DEFAULT 0,
  cost_per_purchase numeric NOT NULL DEFAULT 0,
  cost_per_message numeric NOT NULL DEFAULT 0,
  cpm numeric NOT NULL DEFAULT 0,
  reach integer NOT NULL DEFAULT 0,
  new_messaging_contacts integer NOT NULL DEFAULT 0,
  create_order integer NOT NULL DEFAULT 0,
  budget numeric NOT NULL DEFAULT 0,
  conversations_tiktok_dm integer NOT NULL DEFAULT 0,
  leads_tiktok_dm integer NOT NULL DEFAULT 0,
  conversations_instant_msg integer NOT NULL DEFAULT 0,
  org_id uuid REFERENCES public.organizations(id),
  synced_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_daily_metrics_adset_date UNIQUE (ad_set_id, data_date)
);

CREATE INDEX idx_dm_adset_ad_set ON public.daily_metrics_adset(ad_set_id);
CREATE INDEX idx_dm_adset_campaign ON public.daily_metrics_adset(campaign_id);
CREATE INDEX idx_dm_adset_date ON public.daily_metrics_adset(data_date);
CREATE INDEX idx_dm_adset_org ON public.daily_metrics_adset(org_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_metrics_adset TO authenticated;
GRANT ALL ON public.daily_metrics_adset TO service_role;
ALTER TABLE public.daily_metrics_adset ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_daily_metrics_adset" ON public.daily_metrics_adset
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) AND (org_id = get_user_org_id(auth.uid())))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND (org_id = get_user_org_id(auth.uid())));

CREATE POLICY "client_read_own_daily_metrics_adset" ON public.daily_metrics_adset FOR SELECT
  USING (campaign_id IN (SELECT c.id FROM public.campaigns c WHERE c.client_id = auth.uid()));

-- ---------- DAILY_METRICS_AD ----------
CREATE TABLE public.daily_metrics_ad (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_id uuid NOT NULL REFERENCES public.ads(id) ON DELETE CASCADE,
  ad_set_id uuid NOT NULL REFERENCES public.ad_sets(id) ON DELETE CASCADE,
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
  view_content integer NOT NULL DEFAULT 0,
  add_to_cart integer NOT NULL DEFAULT 0,
  initiate_checkout integer NOT NULL DEFAULT 0,
  purchase integer NOT NULL DEFAULT 0,
  messaging_conversations integer NOT NULL DEFAULT 0,
  cost_per_purchase numeric NOT NULL DEFAULT 0,
  cost_per_message numeric NOT NULL DEFAULT 0,
  cpm numeric NOT NULL DEFAULT 0,
  reach integer NOT NULL DEFAULT 0,
  new_messaging_contacts integer NOT NULL DEFAULT 0,
  create_order integer NOT NULL DEFAULT 0,
  budget numeric NOT NULL DEFAULT 0,
  conversations_tiktok_dm integer NOT NULL DEFAULT 0,
  leads_tiktok_dm integer NOT NULL DEFAULT 0,
  conversations_instant_msg integer NOT NULL DEFAULT 0,
  org_id uuid REFERENCES public.organizations(id),
  synced_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_daily_metrics_ad_date UNIQUE (ad_id, data_date)
);

CREATE INDEX idx_dm_ad_ad ON public.daily_metrics_ad(ad_id);
CREATE INDEX idx_dm_ad_ad_set ON public.daily_metrics_ad(ad_set_id);
CREATE INDEX idx_dm_ad_campaign ON public.daily_metrics_ad(campaign_id);
CREATE INDEX idx_dm_ad_date ON public.daily_metrics_ad(data_date);
CREATE INDEX idx_dm_ad_org ON public.daily_metrics_ad(org_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_metrics_ad TO authenticated;
GRANT ALL ON public.daily_metrics_ad TO service_role;
ALTER TABLE public.daily_metrics_ad ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_daily_metrics_ad" ON public.daily_metrics_ad
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) AND (org_id = get_user_org_id(auth.uid())))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND (org_id = get_user_org_id(auth.uid())));

CREATE POLICY "client_read_own_daily_metrics_ad" ON public.daily_metrics_ad FOR SELECT
  USING (campaign_id IN (SELECT c.id FROM public.campaigns c WHERE c.client_id = auth.uid()));

-- ---------- Auto-fill org_id / client_id triggers ----------
CREATE OR REPLACE FUNCTION public.set_org_id_for_ad_sets()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.org_id IS NULL THEN NEW.org_id := get_user_org_id(auth.uid()); END IF;
  IF NEW.org_id IS NULL AND NEW.ad_account_id IS NOT NULL THEN
    SELECT org_id INTO NEW.org_id FROM public.ad_accounts WHERE id = NEW.ad_account_id;
  END IF;
  IF NEW.client_id IS NULL AND NEW.campaign_id IS NOT NULL THEN
    SELECT client_id INTO NEW.client_id FROM public.campaigns WHERE id = NEW.campaign_id;
  END IF;
  IF NEW.org_id IS NULL THEN
    SELECT id INTO NEW.org_id FROM public.organizations LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_org_id_ad_sets BEFORE INSERT ON public.ad_sets
  FOR EACH ROW EXECUTE FUNCTION public.set_org_id_for_ad_sets();

CREATE OR REPLACE FUNCTION public.set_org_id_for_ads()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.org_id IS NULL THEN NEW.org_id := get_user_org_id(auth.uid()); END IF;
  IF NEW.org_id IS NULL AND NEW.ad_account_id IS NOT NULL THEN
    SELECT org_id INTO NEW.org_id FROM public.ad_accounts WHERE id = NEW.ad_account_id;
  END IF;
  IF NEW.client_id IS NULL AND NEW.campaign_id IS NOT NULL THEN
    SELECT client_id INTO NEW.client_id FROM public.campaigns WHERE id = NEW.campaign_id;
  END IF;
  IF NEW.org_id IS NULL THEN
    SELECT id INTO NEW.org_id FROM public.organizations LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_org_id_ads BEFORE INSERT ON public.ads
  FOR EACH ROW EXECUTE FUNCTION public.set_org_id_for_ads();

CREATE OR REPLACE FUNCTION public.set_org_id_for_dm_adset()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.org_id IS NULL AND NEW.ad_set_id IS NOT NULL THEN
    SELECT org_id INTO NEW.org_id FROM public.ad_sets WHERE id = NEW.ad_set_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_org_id_dm_adset BEFORE INSERT ON public.daily_metrics_adset
  FOR EACH ROW EXECUTE FUNCTION public.set_org_id_for_dm_adset();

CREATE OR REPLACE FUNCTION public.set_org_id_for_dm_ad()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.org_id IS NULL AND NEW.ad_id IS NOT NULL THEN
    SELECT org_id INTO NEW.org_id FROM public.ads WHERE id = NEW.ad_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_org_id_dm_ad BEFORE INSERT ON public.daily_metrics_ad
  FOR EACH ROW EXECUTE FUNCTION public.set_org_id_for_dm_ad();
