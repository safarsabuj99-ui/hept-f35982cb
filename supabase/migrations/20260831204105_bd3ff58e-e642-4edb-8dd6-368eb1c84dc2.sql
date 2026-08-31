-- 1) Missing UPDATE policy for push_subscriptions upserts
CREATE POLICY users_update_own_push_subs
ON public.push_subscriptions
FOR UPDATE
TO authenticated
USING (user_id = (SELECT auth.uid()))
WITH CHECK (user_id = (SELECT auth.uid()));

GRANT UPDATE ON public.push_subscriptions TO authenticated;

-- 2) RLS init-plan optimisation: evaluate role/org helpers once per statement
DROP POLICY IF EXISTS admin_all_transactions ON public.transactions;
CREATE POLICY admin_all_transactions
ON public.transactions
FOR ALL
TO authenticated
USING ((SELECT public.has_role((SELECT auth.uid()), 'admin'::app_role)) AND org_id = (SELECT public.get_user_org_id((SELECT auth.uid()))))
WITH CHECK ((SELECT public.has_role((SELECT auth.uid()), 'admin'::app_role)) AND org_id = (SELECT public.get_user_org_id((SELECT auth.uid()))));

DROP POLICY IF EXISTS manager_read_transactions ON public.transactions;
CREATE POLICY manager_read_transactions
ON public.transactions
FOR SELECT
TO authenticated
USING ((SELECT public.has_role((SELECT auth.uid()), 'manager'::app_role)) AND client_id IN (SELECT public.get_managed_client_ids((SELECT auth.uid()))));

DROP POLICY IF EXISTS manager_insert_transactions ON public.transactions;
CREATE POLICY manager_insert_transactions
ON public.transactions
FOR INSERT
TO authenticated
WITH CHECK ((SELECT public.has_role((SELECT auth.uid()), 'manager'::app_role)) AND client_id IN (SELECT public.get_managed_client_ids((SELECT auth.uid()))));

DROP POLICY IF EXISTS client_read_completed_transactions ON public.transactions;
CREATE POLICY client_read_completed_transactions
ON public.transactions
FOR SELECT
TO authenticated
USING (client_id = (SELECT auth.uid()) AND status = 'completed'::transaction_status);

DROP POLICY IF EXISTS admin_all_daily_metrics ON public.daily_metrics;
CREATE POLICY admin_all_daily_metrics
ON public.daily_metrics
FOR ALL
TO authenticated
USING ((SELECT public.has_role((SELECT auth.uid()), 'admin'::app_role)) AND org_id = (SELECT public.get_user_org_id((SELECT auth.uid()))))
WITH CHECK ((SELECT public.has_role((SELECT auth.uid()), 'admin'::app_role)) AND org_id = (SELECT public.get_user_org_id((SELECT auth.uid()))));

DROP POLICY IF EXISTS manager_read_daily_metrics ON public.daily_metrics;
CREATE POLICY manager_read_daily_metrics
ON public.daily_metrics
FOR SELECT
TO public
USING ((SELECT public.has_role((SELECT auth.uid()), 'manager'::app_role)) AND campaign_id IN (
  SELECT c.id FROM public.campaigns c
  WHERE c.client_id IN (SELECT public.get_managed_client_ids((SELECT auth.uid())))
));

DROP POLICY IF EXISTS client_read_own_daily_metrics ON public.daily_metrics;
CREATE POLICY client_read_own_daily_metrics
ON public.daily_metrics
FOR SELECT
TO public
USING (campaign_id IN (
  SELECT c.id FROM public.campaigns c WHERE c.client_id = (SELECT auth.uid())
));

-- 3) Index for the hottest transactions query (type + status, newest first)
CREATE INDEX IF NOT EXISTS idx_transactions_type_status_created
  ON public.transactions (type, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_transactions_status
  ON public.transactions (status);
