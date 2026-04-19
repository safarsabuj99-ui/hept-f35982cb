-- Layer 3: Harden the trigger to use api_integration_id as derivation source
-- when auth.uid() is NULL (service-role inserts), instead of falling back to
-- the first organization in the table (which causes silent cross-tenant leaks).
CREATE OR REPLACE FUNCTION public.set_org_id_for_ad_accounts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- 1. If explicitly provided by caller, trust it.
  IF NEW.org_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- 2. Derive from authenticated caller's profile.
  NEW.org_id := get_user_org_id(auth.uid());

  -- 3. Derive from the source api_integration (service-role contexts).
  IF NEW.org_id IS NULL AND NEW.api_integration_id IS NOT NULL THEN
    SELECT org_id INTO NEW.org_id
    FROM public.api_integrations
    WHERE id = NEW.api_integration_id;
  END IF;

  -- 4. Derive from the linked client.
  IF NEW.org_id IS NULL AND NEW.client_id IS NOT NULL THEN
    SELECT org_id INTO NEW.org_id
    FROM public.profiles
    WHERE user_id = NEW.client_id LIMIT 1;
  END IF;

  -- 5. Hard fail instead of silently assigning to the wrong org.
  IF NEW.org_id IS NULL THEN
    RAISE EXCEPTION 'Cannot determine org_id for ad_account: provide org_id explicitly or link to an api_integration/client.';
  END IF;

  RETURN NEW;
END;
$function$;

-- Layer 4: One-shot data correction — reassign any ad_accounts whose org_id
-- doesn't match their source api_integration's org_id back to the correct org.
UPDATE public.ad_accounts a
SET org_id = i.org_id
FROM public.api_integrations i
WHERE a.api_integration_id = i.id
  AND i.org_id IS NOT NULL
  AND a.org_id IS DISTINCT FROM i.org_id;