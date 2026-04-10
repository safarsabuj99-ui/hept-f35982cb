
-- Enable extensions for cron and HTTP
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Resource limit enforcement trigger for profiles (client count)
CREATE OR REPLACE FUNCTION public.check_client_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_max integer;
  v_current integer;
BEGIN
  -- Only check for client role users
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = NEW.user_id AND role = 'client') THEN
    RETURN NEW;
  END IF;

  v_org_id := NEW.org_id;
  IF v_org_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT max_clients INTO v_max FROM public.organizations WHERE id = v_org_id;
  IF v_max IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_current
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.user_id
  WHERE p.org_id = v_org_id AND ur.role = 'client';

  IF v_current >= v_max THEN
    RAISE EXCEPTION 'Client limit reached: this agency plan allows a maximum of % clients.', v_max;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_client_limit
BEFORE INSERT ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.check_client_limit();

-- Resource limit enforcement trigger for ad_accounts
CREATE OR REPLACE FUNCTION public.check_ad_account_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_max integer;
  v_current integer;
BEGIN
  v_org_id := NEW.org_id;
  IF v_org_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT max_ad_accounts INTO v_max FROM public.organizations WHERE id = v_org_id;
  IF v_max IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_current
  FROM public.ad_accounts
  WHERE org_id = v_org_id AND is_active = true;

  IF v_current >= v_max THEN
    RAISE EXCEPTION 'Ad account limit reached: this agency plan allows a maximum of % ad accounts.', v_max;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_ad_account_limit
BEFORE INSERT ON public.ad_accounts
FOR EACH ROW
EXECUTE FUNCTION public.check_ad_account_limit();
