
-- 1. ad_account_clients: fallback ad_account_id → ad_accounts.org_id, then client_id → profiles.org_id
CREATE OR REPLACE FUNCTION public.set_org_id_for_ad_account_clients()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.org_id IS NULL THEN
    NEW.org_id := get_user_org_id(auth.uid());
  END IF;
  IF NEW.org_id IS NULL AND NEW.ad_account_id IS NOT NULL THEN
    SELECT org_id INTO NEW.org_id FROM public.ad_accounts WHERE id = NEW.ad_account_id;
  END IF;
  IF NEW.org_id IS NULL AND NEW.client_id IS NOT NULL THEN
    SELECT org_id INTO NEW.org_id FROM public.profiles WHERE user_id = NEW.client_id LIMIT 1;
  END IF;
  IF NEW.org_id IS NULL THEN
    SELECT id INTO NEW.org_id FROM public.organizations LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_org_id_ad_account_clients ON public.ad_account_clients;
CREATE TRIGGER set_org_id_ad_account_clients
  BEFORE INSERT ON public.ad_account_clients
  FOR EACH ROW EXECUTE FUNCTION public.set_org_id_for_ad_account_clients();

-- 2. ad_accounts: fallback auth → first org
CREATE OR REPLACE FUNCTION public.set_org_id_for_ad_accounts()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.org_id IS NULL THEN
    NEW.org_id := get_user_org_id(auth.uid());
  END IF;
  IF NEW.org_id IS NULL AND NEW.client_id IS NOT NULL THEN
    SELECT org_id INTO NEW.org_id FROM public.profiles WHERE user_id = NEW.client_id LIMIT 1;
  END IF;
  IF NEW.org_id IS NULL THEN
    SELECT id INTO NEW.org_id FROM public.organizations LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_org_id_ad_accounts ON public.ad_accounts;
CREATE TRIGGER set_org_id_ad_accounts
  BEFORE INSERT ON public.ad_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_org_id_for_ad_accounts();

-- 3. billing_notifications: fallback ad_account_id → ad_accounts.org_id, client_id → profiles.org_id
CREATE OR REPLACE FUNCTION public.set_org_id_for_billing_notifications()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.org_id IS NULL THEN
    NEW.org_id := get_user_org_id(auth.uid());
  END IF;
  IF NEW.org_id IS NULL AND NEW.ad_account_id IS NOT NULL THEN
    SELECT org_id INTO NEW.org_id FROM public.ad_accounts WHERE id = NEW.ad_account_id;
  END IF;
  IF NEW.org_id IS NULL AND NEW.client_id IS NOT NULL THEN
    SELECT org_id INTO NEW.org_id FROM public.profiles WHERE user_id = NEW.client_id LIMIT 1;
  END IF;
  IF NEW.org_id IS NULL THEN
    SELECT id INTO NEW.org_id FROM public.organizations LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_org_id_billing_notifications ON public.billing_notifications;
CREATE TRIGGER set_org_id_billing_notifications
  BEFORE INSERT ON public.billing_notifications
  FOR EACH ROW EXECUTE FUNCTION public.set_org_id_for_billing_notifications();

-- 4. campaign_mappings: fallback campaign_id → campaigns.org_id, ad_account_id → ad_accounts.org_id
CREATE OR REPLACE FUNCTION public.set_org_id_for_campaign_mappings()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.org_id IS NULL THEN
    NEW.org_id := get_user_org_id(auth.uid());
  END IF;
  IF NEW.org_id IS NULL AND NEW.ad_account_id IS NOT NULL THEN
    SELECT org_id INTO NEW.org_id FROM public.ad_accounts WHERE id = NEW.ad_account_id;
  END IF;
  IF NEW.org_id IS NULL AND NEW.client_id IS NOT NULL THEN
    SELECT org_id INTO NEW.org_id FROM public.profiles WHERE user_id = NEW.client_id LIMIT 1;
  END IF;
  IF NEW.org_id IS NULL THEN
    SELECT id INTO NEW.org_id FROM public.organizations LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_org_id_campaign_mappings ON public.campaign_mappings;
CREATE TRIGGER set_org_id_campaign_mappings
  BEFORE INSERT ON public.campaign_mappings
  FOR EACH ROW EXECUTE FUNCTION public.set_org_id_for_campaign_mappings();

-- 5. campaigns: fallback ad_account_id → ad_accounts.org_id
CREATE OR REPLACE FUNCTION public.set_org_id_for_campaigns()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.org_id IS NULL THEN
    NEW.org_id := get_user_org_id(auth.uid());
  END IF;
  IF NEW.org_id IS NULL AND NEW.ad_account_id IS NOT NULL THEN
    SELECT org_id INTO NEW.org_id FROM public.ad_accounts WHERE id = NEW.ad_account_id;
  END IF;
  IF NEW.org_id IS NULL AND NEW.client_id IS NOT NULL THEN
    SELECT org_id INTO NEW.org_id FROM public.profiles WHERE user_id = NEW.client_id LIMIT 1;
  END IF;
  IF NEW.org_id IS NULL THEN
    SELECT id INTO NEW.org_id FROM public.organizations LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_org_id_campaigns ON public.campaigns;
CREATE TRIGGER set_org_id_campaigns
  BEFORE INSERT ON public.campaigns
  FOR EACH ROW EXECUTE FUNCTION public.set_org_id_for_campaigns();

-- 6. notifications: fallback user_id → profiles.org_id (reuse existing set_org_id_from_user, just ensure trigger exists)
DROP TRIGGER IF EXISTS set_org_id_notifications ON public.notifications;
CREATE TRIGGER set_org_id_notifications
  BEFORE INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.set_org_id_from_user();

-- 7. campaign_requests: fallback client_id → profiles.org_id
CREATE OR REPLACE FUNCTION public.set_org_id_for_campaign_requests()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.org_id IS NULL THEN
    NEW.org_id := get_user_org_id(auth.uid());
  END IF;
  IF NEW.org_id IS NULL AND NEW.client_id IS NOT NULL THEN
    SELECT org_id INTO NEW.org_id FROM public.profiles WHERE user_id = NEW.client_id LIMIT 1;
  END IF;
  IF NEW.org_id IS NULL THEN
    SELECT id INTO NEW.org_id FROM public.organizations LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_org_id_campaign_requests ON public.campaign_requests;
CREATE TRIGGER set_org_id_campaign_requests
  BEFORE INSERT ON public.campaign_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_org_id_for_campaign_requests();

-- 8. client_notices: fallback created_by → profiles.org_id
CREATE OR REPLACE FUNCTION public.set_org_id_for_client_notices()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.org_id IS NULL THEN
    NEW.org_id := get_user_org_id(auth.uid());
  END IF;
  IF NEW.org_id IS NULL AND NEW.created_by IS NOT NULL THEN
    SELECT org_id INTO NEW.org_id FROM public.profiles WHERE user_id = NEW.created_by LIMIT 1;
  END IF;
  IF NEW.org_id IS NULL THEN
    SELECT id INTO NEW.org_id FROM public.organizations LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_org_id_client_notices ON public.client_notices;
CREATE TRIGGER set_org_id_client_notices
  BEFORE INSERT ON public.client_notices
  FOR EACH ROW EXECUTE FUNCTION public.set_org_id_for_client_notices();

-- ============ BACKFILL existing NULLs ============

-- ad_account_clients: from ad_accounts
UPDATE public.ad_account_clients aac
SET org_id = aa.org_id
FROM public.ad_accounts aa
WHERE aac.ad_account_id = aa.id AND aac.org_id IS NULL AND aa.org_id IS NOT NULL;

-- ad_accounts: from client profiles or first org
UPDATE public.ad_accounts aa
SET org_id = p.org_id
FROM public.profiles p
WHERE aa.client_id = p.user_id AND aa.org_id IS NULL AND p.org_id IS NOT NULL;

UPDATE public.ad_accounts
SET org_id = (SELECT id FROM public.organizations LIMIT 1)
WHERE org_id IS NULL;

-- billing_notifications: from ad_accounts
UPDATE public.billing_notifications bn
SET org_id = aa.org_id
FROM public.ad_accounts aa
WHERE bn.ad_account_id = aa.id AND bn.org_id IS NULL AND aa.org_id IS NOT NULL;

-- campaign_mappings: from ad_accounts
UPDATE public.campaign_mappings cm
SET org_id = aa.org_id
FROM public.ad_accounts aa
WHERE cm.ad_account_id = aa.id AND cm.org_id IS NULL AND aa.org_id IS NOT NULL;

-- campaigns: from ad_accounts
UPDATE public.campaigns c
SET org_id = aa.org_id
FROM public.ad_accounts aa
WHERE c.ad_account_id = aa.id AND c.org_id IS NULL AND aa.org_id IS NOT NULL;

-- notifications: from profiles
UPDATE public.notifications n
SET org_id = p.org_id
FROM public.profiles p
WHERE n.user_id = p.user_id AND n.org_id IS NULL AND p.org_id IS NOT NULL;

-- campaign_requests: from profiles
UPDATE public.campaign_requests cr
SET org_id = p.org_id
FROM public.profiles p
WHERE cr.client_id = p.user_id AND cr.org_id IS NULL AND p.org_id IS NOT NULL;

-- client_notices: from profiles
UPDATE public.client_notices cn
SET org_id = p.org_id
FROM public.profiles p
WHERE cn.created_by = p.user_id AND cn.org_id IS NULL AND p.org_id IS NOT NULL;
