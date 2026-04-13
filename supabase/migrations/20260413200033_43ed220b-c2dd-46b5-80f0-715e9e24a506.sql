
-- 1. Replace set_org_id_from_auth with smart cascading trigger for transactions
CREATE OR REPLACE FUNCTION public.set_org_id_from_auth()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.org_id IS NULL THEN
    -- Try auth.uid() first (browser-initiated)
    NEW.org_id := get_user_org_id(auth.uid());
  END IF;
  IF NEW.org_id IS NULL AND NEW.client_id IS NOT NULL THEN
    -- Fallback: lookup from client's profile (edge function / service role)
    SELECT org_id INTO NEW.org_id FROM public.profiles WHERE user_id = NEW.client_id LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

-- 2. Smart trigger for audit_logs (falls back to user_id profile)
CREATE OR REPLACE FUNCTION public.set_org_id_from_user()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.org_id IS NULL THEN
    NEW.org_id := get_user_org_id(auth.uid());
  END IF;
  IF NEW.org_id IS NULL AND NEW.user_id IS NOT NULL THEN
    SELECT org_id INTO NEW.org_id FROM public.profiles WHERE user_id = NEW.user_id LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

-- Drop existing trigger on audit_logs if any, then create
DROP TRIGGER IF EXISTS set_org_id_audit_logs ON public.audit_logs;
CREATE TRIGGER set_org_id_audit_logs
  BEFORE INSERT ON public.audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.set_org_id_from_user();

-- 3. Smart trigger for usd_inventory_snapshots
CREATE OR REPLACE FUNCTION public.set_org_id_for_snapshot()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.org_id IS NULL THEN
    NEW.org_id := get_user_org_id(auth.uid());
  END IF;
  IF NEW.org_id IS NULL AND NEW.created_by IS NOT NULL AND NEW.created_by <> '00000000-0000-0000-0000-000000000000' THEN
    SELECT org_id INTO NEW.org_id FROM public.profiles WHERE user_id = NEW.created_by LIMIT 1;
  END IF;
  IF NEW.org_id IS NULL THEN
    -- Last resort: pick the first org (single-tenant scenario)
    SELECT id INTO NEW.org_id FROM public.organizations LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_org_id_snapshots ON public.usd_inventory_snapshots;
CREATE TRIGGER set_org_id_snapshots
  BEFORE INSERT OR UPDATE ON public.usd_inventory_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION public.set_org_id_for_snapshot();

-- 4. Backfill transactions with NULL org_id
UPDATE public.transactions t
SET org_id = p.org_id
FROM public.profiles p
WHERE t.client_id = p.user_id
  AND t.org_id IS NULL
  AND p.org_id IS NOT NULL;

-- 5. Backfill notifications with NULL org_id
UPDATE public.notifications n
SET org_id = p.org_id
FROM public.profiles p
WHERE n.user_id = p.user_id
  AND n.org_id IS NULL
  AND p.org_id IS NOT NULL;

-- 6. Backfill usd_inventory_snapshots with NULL org_id
UPDATE public.usd_inventory_snapshots
SET org_id = (SELECT id FROM public.organizations LIMIT 1)
WHERE org_id IS NULL;

-- 7. Backfill audit_logs with NULL org_id
UPDATE public.audit_logs a
SET org_id = p.org_id
FROM public.profiles p
WHERE a.user_id = p.user_id
  AND a.org_id IS NULL
  AND p.org_id IS NOT NULL;
