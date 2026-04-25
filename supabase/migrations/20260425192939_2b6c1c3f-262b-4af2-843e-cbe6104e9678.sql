-- Helper trigger function: prevents the same mapping keyword from being used by
-- two different clients within the same organization (case-insensitive, trimmed).
CREATE OR REPLACE FUNCTION public.check_mapping_keyword_unique()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kw text;
  v_owner_id uuid;
  v_owner_name text;
  v_self_client uuid;
BEGIN
  -- Normalize the incoming keyword
  v_kw := LOWER(TRIM(COALESCE(NEW.mapping_keyword, '')));

  -- Empty keywords are always allowed
  IF v_kw = '' THEN
    RETURN NEW;
  END IF;

  -- Determine which client this row belongs to (depends on table)
  IF TG_TABLE_NAME = 'profiles' THEN
    v_self_client := NEW.user_id;
  ELSE
    v_self_client := NEW.client_id;
  END IF;

  -- 1. Check profiles table for a conflicting keyword owned by a DIFFERENT client
  SELECT user_id INTO v_owner_id
  FROM public.profiles
  WHERE org_id = NEW.org_id
    AND LOWER(TRIM(mapping_keyword)) = v_kw
    AND user_id <> COALESCE(v_self_client, '00000000-0000-0000-0000-000000000000'::uuid)
  LIMIT 1;

  IF v_owner_id IS NOT NULL THEN
    SELECT full_name INTO v_owner_name FROM public.profiles WHERE user_id = v_owner_id;
    RAISE EXCEPTION 'Keyword "%" is already used by client "%". Please choose a different keyword.',
      TRIM(NEW.mapping_keyword), COALESCE(v_owner_name, 'Unknown');
  END IF;

  -- 2. Check ad_account_clients table for a conflicting keyword owned by a DIFFERENT client
  SELECT client_id INTO v_owner_id
  FROM public.ad_account_clients
  WHERE org_id = NEW.org_id
    AND LOWER(TRIM(mapping_keyword)) = v_kw
    AND client_id <> COALESCE(v_self_client, '00000000-0000-0000-0000-000000000000'::uuid)
  LIMIT 1;

  IF v_owner_id IS NOT NULL THEN
    SELECT full_name INTO v_owner_name FROM public.profiles WHERE user_id = v_owner_id;
    RAISE EXCEPTION 'Keyword "%" is already used by client "%". Please choose a different keyword.',
      TRIM(NEW.mapping_keyword), COALESCE(v_owner_name, 'Unknown');
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger on profiles: only fire when mapping_keyword actually changes
DROP TRIGGER IF EXISTS check_mapping_keyword_unique_profiles ON public.profiles;
CREATE TRIGGER check_mapping_keyword_unique_profiles
  BEFORE INSERT OR UPDATE OF mapping_keyword ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.check_mapping_keyword_unique();

-- Trigger on ad_account_clients
DROP TRIGGER IF EXISTS check_mapping_keyword_unique_aac ON public.ad_account_clients;
CREATE TRIGGER check_mapping_keyword_unique_aac
  BEFORE INSERT OR UPDATE OF mapping_keyword ON public.ad_account_clients
  FOR EACH ROW
  EXECUTE FUNCTION public.check_mapping_keyword_unique();

-- Helpful index for fast lookups (also doubles as documentation of intent)
CREATE INDEX IF NOT EXISTS idx_aac_org_keyword_lower
  ON public.ad_account_clients (org_id, LOWER(TRIM(mapping_keyword)))
  WHERE mapping_keyword IS NOT NULL AND mapping_keyword <> '';

CREATE INDEX IF NOT EXISTS idx_profiles_org_keyword_lower
  ON public.profiles (org_id, LOWER(TRIM(mapping_keyword)))
  WHERE mapping_keyword IS NOT NULL AND mapping_keyword <> '';