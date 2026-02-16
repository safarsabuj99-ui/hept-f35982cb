
-- 1. Create junction table for many-to-many ad_account <-> client with mapping keyword
CREATE TABLE public.ad_account_clients (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ad_account_id uuid NOT NULL REFERENCES public.ad_accounts(id) ON DELETE CASCADE,
  client_id uuid NOT NULL,
  mapping_keyword text NOT NULL DEFAULT '',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(ad_account_id, client_id)
);

-- 2. Enable RLS
ALTER TABLE public.ad_account_clients ENABLE ROW LEVEL SECURITY;

-- 3. RLS policies
CREATE POLICY "admin_all_ad_account_clients"
  ON public.ad_account_clients FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "manager_read_ad_account_clients"
  ON public.ad_account_clients FOR SELECT
  USING (has_role(auth.uid(), 'manager'::app_role) AND client_id IN (SELECT get_managed_client_ids(auth.uid())));

CREATE POLICY "client_read_own_ad_account_clients"
  ON public.ad_account_clients FOR SELECT
  USING (client_id = auth.uid());

-- 4. Migrate existing assignments into junction table
INSERT INTO public.ad_account_clients (ad_account_id, client_id, mapping_keyword)
SELECT a.id, a.client_id, COALESCE(p.mapping_keyword, '')
FROM public.ad_accounts a
LEFT JOIN public.profiles p ON p.user_id = a.client_id
WHERE a.client_id IS NOT NULL
ON CONFLICT (ad_account_id, client_id) DO NOTHING;

-- 5. Update RLS on daily_ad_spend to use junction table instead of ad_accounts.client_id
DROP POLICY IF EXISTS "client_read_own_daily_ad_spend" ON public.daily_ad_spend;
CREATE POLICY "client_read_own_daily_ad_spend"
  ON public.daily_ad_spend FOR SELECT
  USING (ad_account_id IN (
    SELECT aac.ad_account_id FROM public.ad_account_clients aac WHERE aac.client_id = auth.uid()
  ));

DROP POLICY IF EXISTS "manager_read_daily_ad_spend" ON public.daily_ad_spend;
CREATE POLICY "manager_read_daily_ad_spend"
  ON public.daily_ad_spend FOR SELECT
  USING (has_role(auth.uid(), 'manager'::app_role) AND ad_account_id IN (
    SELECT aac.ad_account_id FROM public.ad_account_clients aac WHERE aac.client_id IN (SELECT get_managed_client_ids(auth.uid()))
  ));

-- 6. Update RLS on ad_accounts for manager/client to use junction table
DROP POLICY IF EXISTS "manager_read_ad_accounts" ON public.ad_accounts;
CREATE POLICY "manager_read_ad_accounts"
  ON public.ad_accounts FOR SELECT
  USING (has_role(auth.uid(), 'manager'::app_role) AND id IN (
    SELECT aac.ad_account_id FROM public.ad_account_clients aac WHERE aac.client_id IN (SELECT get_managed_client_ids(auth.uid()))
  ));

DROP POLICY IF EXISTS "client_read_own_ad_accounts" ON public.ad_accounts;
CREATE POLICY "client_read_own_ad_accounts"
  ON public.ad_accounts FOR SELECT
  USING (id IN (
    SELECT aac.ad_account_id FROM public.ad_account_clients aac WHERE aac.client_id = auth.uid()
  ));
