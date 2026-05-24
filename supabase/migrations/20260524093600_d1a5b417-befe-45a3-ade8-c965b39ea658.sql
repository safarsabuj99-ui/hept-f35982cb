
-- 1. subscription-proofs bucket: make private, scope reads
UPDATE storage.buckets SET public = false WHERE id = 'subscription-proofs';

DROP POLICY IF EXISTS "public_read_subscription_proofs" ON storage.objects;
DROP POLICY IF EXISTS "authenticated_read_subscription_proofs" ON storage.objects;

CREATE POLICY "owner_or_platform_read_subscription_proofs"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'subscription-proofs'
  AND (owner = auth.uid() OR public.has_role(auth.uid(), 'platform_owner'::public.app_role))
);

-- 2. audit_logs: restrict insert to own user_id (service role bypasses RLS)
DROP POLICY IF EXISTS "system_insert_logs" ON public.audit_logs;
CREATE POLICY "users_insert_own_audit_logs"
ON public.audit_logs FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- 3. notifications: only admins/platform_owners can target other users; self-targets allowed
DROP POLICY IF EXISTS "service_insert_notifications" ON public.notifications;
CREATE POLICY "scoped_insert_notifications"
ON public.notifications FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'platform_owner'::public.app_role)
);

-- 4. liquid_fund_entries: add org filter for managers
DROP POLICY IF EXISTS "manager_finance_read_liquid_fund_entries" ON public.liquid_fund_entries;
CREATE POLICY "manager_finance_read_liquid_fund_entries"
ON public.liquid_fund_entries FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'manager'::public.app_role)
  AND public.has_permission(auth.uid(), 'can_manage_finance')
  AND org_id = public.get_user_org_id(auth.uid())
);

-- 5. usd_purchases: add org filter for managers
DROP POLICY IF EXISTS "manager_finance_usd_purchases" ON public.usd_purchases;
CREATE POLICY "manager_finance_usd_purchases"
ON public.usd_purchases FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'manager'::public.app_role)
  AND public.has_permission(auth.uid(), 'can_manage_finance')
  AND org_id = public.get_user_org_id(auth.uid())
);

-- 6. client_notices: scope reads to caller's org
DROP POLICY IF EXISTS "client_read_active_notices" ON public.client_notices;
CREATE POLICY "client_read_active_notices"
ON public.client_notices FOR SELECT
TO authenticated
USING (
  is_active = true
  AND starts_at <= now()
  AND (ends_at IS NULL OR ends_at > now())
  AND org_id = public.get_user_org_id(auth.uid())
);

-- 7. affiliate_links: remove unauthenticated public read
DROP POLICY IF EXISTS "affiliate_links_public_read" ON public.affiliate_links;
