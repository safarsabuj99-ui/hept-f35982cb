
-- ============================================================
-- FIX: Scope all admin_all_* RLS policies by org_id
-- ============================================================

-- 1. ad_account_clients (has org_id)
DROP POLICY IF EXISTS "admin_all_ad_account_clients" ON public.ad_account_clients;
CREATE POLICY "admin_all_ad_account_clients" ON public.ad_account_clients
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) AND org_id = get_user_org_id(auth.uid()))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND org_id = get_user_org_id(auth.uid()));

-- 2. ad_accounts
DROP POLICY IF EXISTS "admin_all_ad_accounts" ON public.ad_accounts;
CREATE POLICY "admin_all_ad_accounts" ON public.ad_accounts
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) AND org_id = get_user_org_id(auth.uid()))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND org_id = get_user_org_id(auth.uid()));

-- 3. agency_accounts
DROP POLICY IF EXISTS "admin_all_agency_accounts" ON public.agency_accounts;
CREATE POLICY "admin_all_agency_accounts" ON public.agency_accounts
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) AND org_id = get_user_org_id(auth.uid()))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND org_id = get_user_org_id(auth.uid()));

-- 4. agency_expenses
DROP POLICY IF EXISTS "admin_all_agency_expenses" ON public.agency_expenses;
CREATE POLICY "admin_all_agency_expenses" ON public.agency_expenses
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) AND org_id = get_user_org_id(auth.uid()))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND org_id = get_user_org_id(auth.uid()));

-- 5. api_integrations
DROP POLICY IF EXISTS "admin_all_api_integrations" ON public.api_integrations;
CREATE POLICY "admin_all_api_integrations" ON public.api_integrations
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) AND org_id = get_user_org_id(auth.uid()))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND org_id = get_user_org_id(auth.uid()));

-- 6. billing_notifications
DROP POLICY IF EXISTS "admin_all_billing_notifications" ON public.billing_notifications;
CREATE POLICY "admin_all_billing_notifications" ON public.billing_notifications
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) AND org_id = get_user_org_id(auth.uid()))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND org_id = get_user_org_id(auth.uid()));

-- 7. campaign_mappings
DROP POLICY IF EXISTS "admin_all_campaign_mappings" ON public.campaign_mappings;
CREATE POLICY "admin_all_campaign_mappings" ON public.campaign_mappings
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) AND org_id = get_user_org_id(auth.uid()))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND org_id = get_user_org_id(auth.uid()));

-- 8. campaign_performance
DROP POLICY IF EXISTS "admin_all_campaign_performance" ON public.campaign_performance;
CREATE POLICY "admin_all_campaign_performance" ON public.campaign_performance
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) AND org_id = get_user_org_id(auth.uid()))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND org_id = get_user_org_id(auth.uid()));

-- 9. campaign_requests
DROP POLICY IF EXISTS "admin_all_campaign_requests" ON public.campaign_requests;
CREATE POLICY "admin_all_campaign_requests" ON public.campaign_requests
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) AND org_id = get_user_org_id(auth.uid()))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND org_id = get_user_org_id(auth.uid()));

-- 10. campaigns
DROP POLICY IF EXISTS "admin_all_campaigns" ON public.campaigns;
CREATE POLICY "admin_all_campaigns" ON public.campaigns
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) AND org_id = get_user_org_id(auth.uid()))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND org_id = get_user_org_id(auth.uid()));

-- 11. cash_withdrawal_returns
DROP POLICY IF EXISTS "admin_all_cash_withdrawal_returns" ON public.cash_withdrawal_returns;
CREATE POLICY "admin_all_cash_withdrawal_returns" ON public.cash_withdrawal_returns
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) AND org_id = get_user_org_id(auth.uid()))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND org_id = get_user_org_id(auth.uid()));

-- 12. cash_withdrawals
DROP POLICY IF EXISTS "admin_all_cash_withdrawals" ON public.cash_withdrawals;
CREATE POLICY "admin_all_cash_withdrawals" ON public.cash_withdrawals
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) AND org_id = get_user_org_id(auth.uid()))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND org_id = get_user_org_id(auth.uid()));

-- 13. client_notices
DROP POLICY IF EXISTS "admin_all_client_notices" ON public.client_notices;
CREATE POLICY "admin_all_client_notices" ON public.client_notices
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) AND org_id = get_user_org_id(auth.uid()))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND org_id = get_user_org_id(auth.uid()));

-- 14. daily_ad_spend
DROP POLICY IF EXISTS "admin_all_daily_ad_spend" ON public.daily_ad_spend;
CREATE POLICY "admin_all_daily_ad_spend" ON public.daily_ad_spend
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) AND org_id = get_user_org_id(auth.uid()))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND org_id = get_user_org_id(auth.uid()));

-- 15. daily_metrics
DROP POLICY IF EXISTS "admin_all_daily_metrics" ON public.daily_metrics;
CREATE POLICY "admin_all_daily_metrics" ON public.daily_metrics
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) AND org_id = get_user_org_id(auth.uid()))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND org_id = get_user_org_id(auth.uid()));

-- 16. fund_transfers
DROP POLICY IF EXISTS "admin_all_fund_transfers" ON public.fund_transfers;
CREATE POLICY "admin_all_fund_transfers" ON public.fund_transfers
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) AND org_id = get_user_org_id(auth.uid()))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND org_id = get_user_org_id(auth.uid()));

-- 17. liquid_fund_entries
DROP POLICY IF EXISTS "admin_all_liquid_fund_entries" ON public.liquid_fund_entries;
CREATE POLICY "admin_all_liquid_fund_entries" ON public.liquid_fund_entries
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) AND org_id = get_user_org_id(auth.uid()))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND org_id = get_user_org_id(auth.uid()));

-- 18. payment_requests
DROP POLICY IF EXISTS "admin_all_payment_requests" ON public.payment_requests;
CREATE POLICY "admin_all_payment_requests" ON public.payment_requests
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) AND org_id = get_user_org_id(auth.uid()))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND org_id = get_user_org_id(auth.uid()));

-- 19. profiles
DROP POLICY IF EXISTS "admin_all_profiles" ON public.profiles;
CREATE POLICY "admin_all_profiles" ON public.profiles
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) AND org_id = get_user_org_id(auth.uid()))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND org_id = get_user_org_id(auth.uid()));

-- 20. transactions
DROP POLICY IF EXISTS "admin_all_transactions" ON public.transactions;
CREATE POLICY "admin_all_transactions" ON public.transactions
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) AND org_id = get_user_org_id(auth.uid()))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND org_id = get_user_org_id(auth.uid()));

-- 21. usd_inventory_snapshots
DROP POLICY IF EXISTS "admin_all_usd_inventory_snapshots" ON public.usd_inventory_snapshots;
CREATE POLICY "admin_all_usd_inventory_snapshots" ON public.usd_inventory_snapshots
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) AND org_id = get_user_org_id(auth.uid()))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND org_id = get_user_org_id(auth.uid()));

-- 22. usd_purchases
DROP POLICY IF EXISTS "admin_all_usd_purchases" ON public.usd_purchases;
CREATE POLICY "admin_all_usd_purchases" ON public.usd_purchases
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) AND org_id = get_user_org_id(auth.uid()))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND org_id = get_user_org_id(auth.uid()));

-- 23. usd_manual_spends
DROP POLICY IF EXISTS "Admins can manage manual spends" ON public.usd_manual_spends;
CREATE POLICY "admin_all_usd_manual_spends" ON public.usd_manual_spends
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) AND org_id = get_user_org_id(auth.uid()))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND org_id = get_user_org_id(auth.uid()));

-- 24. audit_logs (has org_id) - scope admin read
DROP POLICY IF EXISTS "admin_read_logs" ON public.audit_logs;
CREATE POLICY "admin_read_logs" ON public.audit_logs
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) AND org_id = get_user_org_id(auth.uid()));

-- ============================================================
-- Tables WITHOUT org_id — use indirect joins
-- ============================================================

-- 25. campaign_tasks (join via campaign_requests.org_id)
DROP POLICY IF EXISTS "admin_all_campaign_tasks" ON public.campaign_tasks;
CREATE POLICY "admin_all_campaign_tasks" ON public.campaign_tasks
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) AND EXISTS (
    SELECT 1 FROM public.campaign_requests cr
    WHERE cr.id = campaign_tasks.request_id AND cr.org_id = get_user_org_id(auth.uid())
  ))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND EXISTS (
    SELECT 1 FROM public.campaign_requests cr
    WHERE cr.id = campaign_tasks.request_id AND cr.org_id = get_user_org_id(auth.uid())
  ));

-- 26. guard_pause_jobs (join via campaigns.org_id)
DROP POLICY IF EXISTS "admin_all_guard_pause_jobs" ON public.guard_pause_jobs;
CREATE POLICY "admin_all_guard_pause_jobs" ON public.guard_pause_jobs
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) AND EXISTS (
    SELECT 1 FROM public.campaigns c
    WHERE c.id = guard_pause_jobs.campaign_id AND c.org_id = get_user_org_id(auth.uid())
  ))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND EXISTS (
    SELECT 1 FROM public.campaigns c
    WHERE c.id = guard_pause_jobs.campaign_id AND c.org_id = get_user_org_id(auth.uid())
  ));

-- 27. manager_permissions (join via profiles.org_id)
DROP POLICY IF EXISTS "admin_all_permissions" ON public.manager_permissions;
CREATE POLICY "admin_all_permissions" ON public.manager_permissions
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = manager_permissions.user_id AND p.org_id = get_user_org_id(auth.uid())
  ))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = manager_permissions.user_id AND p.org_id = get_user_org_id(auth.uid())
  ));

-- 28. user_roles (join via profiles.org_id)
DROP POLICY IF EXISTS "admin_all_user_roles" ON public.user_roles;
CREATE POLICY "admin_all_user_roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = user_roles.user_id AND p.org_id = get_user_org_id(auth.uid())
  ))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = user_roles.user_id AND p.org_id = get_user_org_id(auth.uid())
  ));

-- 29. sync_logs (join via ad_accounts.org_id)
DROP POLICY IF EXISTS "admin_all_sync_logs" ON public.sync_logs;
CREATE POLICY "admin_all_sync_logs" ON public.sync_logs
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) AND EXISTS (
    SELECT 1 FROM public.ad_accounts aa
    WHERE aa.id = sync_logs.ad_account_id AND aa.org_id = get_user_org_id(auth.uid())
  ))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND EXISTS (
    SELECT 1 FROM public.ad_accounts aa
    WHERE aa.id = sync_logs.ad_account_id AND aa.org_id = get_user_org_id(auth.uid())
  ));

-- ============================================================
-- Update get_admin_dashboard_summary to filter by org_id
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_admin_dashboard_summary(p_date_from date, p_date_to date, p_org_id uuid DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
  v_org_id uuid;
  v_yesterday date := (CURRENT_DATE AT TIME ZONE 'Asia/Dhaka')::date - 1;
  v_seven_ago date := (CURRENT_DATE AT TIME ZONE 'Asia/Dhaka')::date - 6;
  v_mapped_account_ids uuid[];
  v_campaign_ids uuid[];
  v_range_spend numeric := 0;
  v_yesterday_spend numeric := 0;
  v_pending_count bigint := 0;
  v_active_accounts bigint := 0;
  v_last_synced timestamptz;
  v_range_collect numeric := 0;
  v_spend_history jsonb := '[]'::jsonb;
  v_collect_history jsonb := '[]'::jsonb;
  v_clients jsonb := '[]'::jsonb;
BEGIN
  -- Resolve org_id: use param if provided, else derive from caller
  v_org_id := COALESCE(p_org_id, get_user_org_id(auth.uid()));

  -- 1. Get mapped account IDs for this org
  SELECT array_agg(DISTINCT ad_account_id)
  INTO v_mapped_account_ids
  FROM ad_account_clients
  WHERE mapping_keyword IS NOT NULL AND mapping_keyword <> ''
    AND org_id = v_org_id;

  -- 2. Get campaign IDs from mapped accounts for this org
  IF v_mapped_account_ids IS NOT NULL THEN
    SELECT array_agg(id)
    INTO v_campaign_ids
    FROM campaigns
    WHERE ad_account_id = ANY(v_mapped_account_ids)
      AND org_id = v_org_id;
  END IF;

  -- 3. Range spend (org-scoped)
  SELECT COALESCE(SUM(spend), 0)
  INTO v_range_spend
  FROM daily_metrics
  WHERE (v_campaign_ids IS NULL OR campaign_id = ANY(v_campaign_ids))
    AND org_id = v_org_id
    AND data_date >= p_date_from
    AND data_date <= p_date_to;

  -- 4. Yesterday spend (org-scoped)
  SELECT COALESCE(SUM(spend), 0)
  INTO v_yesterday_spend
  FROM daily_metrics
  WHERE data_date = v_yesterday
    AND org_id = v_org_id;

  -- 5. Pending count (org-scoped)
  SELECT count(*)
  INTO v_pending_count
  FROM transactions
  WHERE status = 'pending_approval'
    AND org_id = v_org_id;

  -- 6. Active accounts (org-scoped)
  SELECT count(*)
  INTO v_active_accounts
  FROM ad_accounts
  WHERE is_active = true
    AND org_id = v_org_id;

  -- 7. Last synced (org-scoped)
  SELECT last_synced_at
  INTO v_last_synced
  FROM api_integrations
  WHERE org_id = v_org_id
  ORDER BY last_synced_at DESC NULLS LAST
  LIMIT 1;

  -- 8. Collections in range (org-scoped)
  SELECT COALESCE(SUM(amount_bdt), 0)
  INTO v_range_collect
  FROM payment_requests
  WHERE status = 'approved'
    AND org_id = v_org_id
    AND (created_at::date) >= p_date_from
    AND (created_at::date) <= p_date_to;

  -- 9. 7-day spend sparkline (org-scoped)
  SELECT COALESCE(jsonb_agg(daily_val ORDER BY d), '[]'::jsonb)
  INTO v_spend_history
  FROM (
    SELECT d, COALESCE(SUM(dm.spend), 0) AS daily_val
    FROM generate_series(v_seven_ago, (CURRENT_DATE AT TIME ZONE 'Asia/Dhaka')::date, '1 day'::interval) AS d
    LEFT JOIN daily_metrics dm ON dm.data_date = d::date
      AND dm.org_id = v_org_id
      AND (v_campaign_ids IS NULL OR dm.campaign_id = ANY(v_campaign_ids))
    GROUP BY d
  ) sub;

  -- 10. 7-day collection sparkline (org-scoped)
  SELECT COALESCE(jsonb_agg(daily_val ORDER BY d), '[]'::jsonb)
  INTO v_collect_history
  FROM (
    SELECT d, COALESCE(SUM(pr.amount_bdt), 0) AS daily_val
    FROM generate_series(v_seven_ago, (CURRENT_DATE AT TIME ZONE 'Asia/Dhaka')::date, '1 day'::interval) AS d
    LEFT JOIN payment_requests pr ON pr.status = 'approved' AND (pr.created_at::date) = d::date
      AND pr.org_id = v_org_id
    GROUP BY d
  ) sub;

  -- 11. Client balances (org-scoped)
  WITH client_users AS (
    SELECT ur.user_id FROM user_roles ur
    JOIN profiles p ON p.user_id = ur.user_id
    WHERE ur.role = 'client' AND p.org_id = v_org_id
  ),
  client_profiles AS (
    SELECT p.user_id, p.full_name, p.email, p.business_name, p.pricing_config
    FROM profiles p
    JOIN client_users cu ON cu.user_id = p.user_id
  ),
  client_balances AS (
    SELECT
      cp.user_id,
      cp.full_name,
      cp.email,
      cp.business_name,
      cp.pricing_config,
      COALESCE(SUM(CASE WHEN t.type = 'credit' AND t.status = 'completed' THEN t.amount ELSE 0 END), 0)
        - COALESCE(SUM(CASE WHEN t.type = 'debit' AND t.status = 'completed' THEN t.amount ELSE 0 END), 0) AS balance
    FROM client_profiles cp
    LEFT JOIN transactions t ON t.client_id = cp.user_id
    GROUP BY cp.user_id, cp.full_name, cp.email, cp.business_name, cp.pricing_config
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'user_id', cb.user_id,
    'full_name', cb.full_name,
    'email', cb.email,
    'business_name', cb.business_name,
    'balance', ROUND(cb.balance::numeric, 2),
    'pricing_config', cb.pricing_config
  )), '[]'::jsonb)
  INTO v_clients
  FROM client_balances cb;

  -- Build result
  v_result := jsonb_build_object(
    'todaySpend', ROUND(v_range_spend::numeric, 2),
    'yesterdaySpend', ROUND(v_yesterday_spend::numeric, 2),
    'todayCollections', ROUND(v_range_collect::numeric, 2),
    'pendingCount', v_pending_count,
    'activeAccounts', v_active_accounts,
    'lastSynced', v_last_synced,
    'spendHistory', v_spend_history,
    'collectHistory', v_collect_history,
    'clients', v_clients
  );

  RETURN v_result;
END;
$function$;
