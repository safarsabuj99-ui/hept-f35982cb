DROP FUNCTION IF EXISTS public.get_admin_dashboard_summary(date, date, uuid);

CREATE OR REPLACE FUNCTION public.get_admin_dashboard_summary(
  p_date_from date,
  p_date_to date,
  p_org_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_org_id uuid := p_org_id;
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
  -- 1. Get mapped account IDs (org-scoped)
  SELECT array_agg(DISTINCT ad_account_id)
  INTO v_mapped_account_ids
  FROM ad_account_clients
  WHERE mapping_keyword IS NOT NULL AND mapping_keyword <> ''
    AND org_id = v_org_id;

  -- 2. Get campaign IDs from mapped accounts (org-scoped)
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
    AND data_date >= p_date_from
    AND data_date <= p_date_to
    AND org_id = v_org_id;

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

  -- 8. Collections in range — use payment_date (org-scoped)
  SELECT COALESCE(SUM(amount_bdt), 0)
  INTO v_range_collect
  FROM payment_requests
  WHERE status = 'approved'
    AND payment_date >= p_date_from
    AND payment_date <= p_date_to
    AND org_id = v_org_id;

  -- 9. 7-day spend sparkline (org-scoped)
  SELECT COALESCE(jsonb_agg(daily_val ORDER BY d), '[]'::jsonb)
  INTO v_spend_history
  FROM (
    SELECT d, COALESCE(SUM(dm.spend), 0) AS daily_val
    FROM generate_series(v_seven_ago, (CURRENT_DATE AT TIME ZONE 'Asia/Dhaka')::date, '1 day'::interval) AS d
    LEFT JOIN daily_metrics dm ON dm.data_date = d::date
      AND (v_campaign_ids IS NULL OR dm.campaign_id = ANY(v_campaign_ids))
      AND dm.org_id = v_org_id
    GROUP BY d
  ) sub;

  -- 10. 7-day collection sparkline — use payment_date (org-scoped)
  SELECT COALESCE(jsonb_agg(daily_val ORDER BY d), '[]'::jsonb)
  INTO v_collect_history
  FROM (
    SELECT d, COALESCE(SUM(pr.amount_bdt), 0) AS daily_val
    FROM generate_series(v_seven_ago, (CURRENT_DATE AT TIME ZONE 'Asia/Dhaka')::date, '1 day'::interval) AS d
    LEFT JOIN payment_requests pr ON pr.status = 'approved'
      AND pr.payment_date = d::date
      AND pr.org_id = v_org_id
    GROUP BY d
  ) sub;

  -- 11. Client balances (org-scoped)
  WITH client_users AS (
    SELECT ur.user_id FROM user_roles ur
    JOIN profiles p ON p.user_id = ur.user_id AND p.org_id = v_org_id
    WHERE ur.role = 'client'
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
    LEFT JOIN transactions t ON t.client_id = cp.user_id AND t.org_id = v_org_id
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
$$;