CREATE OR REPLACE FUNCTION public.get_admin_dashboard_summary(p_date_from date, p_date_to date, p_org_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
  v_org_id uuid := p_org_id;
  v_yesterday date := (CURRENT_DATE AT TIME ZONE 'Asia/Dhaka')::date - 1;
  v_seven_ago date := (CURRENT_DATE AT TIME ZONE 'Asia/Dhaka')::date - 6;
  v_today date := (CURRENT_DATE AT TIME ZONE 'Asia/Dhaka')::date;
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
  -- Primary source: daily_metrics joined to campaigns for org isolation.
  SELECT COALESCE(SUM(dm.spend), 0)
  INTO v_range_spend
  FROM daily_metrics dm
  JOIN campaigns c ON c.id = dm.campaign_id
  WHERE c.org_id = v_org_id
    AND dm.data_date >= p_date_from
    AND dm.data_date <= p_date_to;

  -- Safety net: if range includes TODAY and metrics show 0, fall back to billing spend
  -- (daily_ad_spend is written by fast-lane even before daily_metrics rows exist).
  IF v_range_spend = 0 AND p_date_to >= v_today AND p_date_from <= v_today THEN
    SELECT COALESCE(SUM(das.final_billable_usd), 0)
    INTO v_range_spend
    FROM daily_ad_spend das
    JOIN ad_accounts aa ON aa.id = das.ad_account_id
    WHERE aa.org_id = v_org_id
      AND das.date >= p_date_from
      AND das.date <= p_date_to;
  END IF;

  SELECT COALESCE(SUM(dm.spend), 0)
  INTO v_yesterday_spend
  FROM daily_metrics dm
  JOIN campaigns c ON c.id = dm.campaign_id
  WHERE c.org_id = v_org_id
    AND dm.data_date = v_yesterday;

  SELECT count(*) INTO v_pending_count
  FROM transactions
  WHERE status = 'pending_approval' AND org_id = v_org_id;

  SELECT count(*) INTO v_active_accounts
  FROM ad_accounts
  WHERE is_active = true AND org_id = v_org_id;

  SELECT last_synced_at INTO v_last_synced
  FROM api_integrations
  WHERE org_id = v_org_id
  ORDER BY last_synced_at DESC NULLS LAST
  LIMIT 1;

  SELECT COALESCE(SUM(amount_bdt), 0) INTO v_range_collect
  FROM payment_requests
  WHERE status = 'approved'
    AND payment_date >= p_date_from
    AND payment_date <= p_date_to
    AND org_id = v_org_id;

  -- 7-day spend sparkline with same daily_ad_spend fallback per day.
  SELECT COALESCE(jsonb_agg(daily_val ORDER BY d), '[]'::jsonb)
  INTO v_spend_history
  FROM (
    SELECT
      d::date AS d,
      CASE
        WHEN COALESCE(metric_sum, 0) > 0 THEN metric_sum
        ELSE COALESCE(billing_sum, 0)
      END AS daily_val
    FROM generate_series(v_seven_ago, v_today, '1 day'::interval) AS d
    LEFT JOIN LATERAL (
      SELECT SUM(dm.spend) AS metric_sum
      FROM daily_metrics dm
      JOIN campaigns c ON c.id = dm.campaign_id
      WHERE c.org_id = v_org_id AND dm.data_date = d::date
    ) m ON true
    LEFT JOIN LATERAL (
      SELECT SUM(das.final_billable_usd) AS billing_sum
      FROM daily_ad_spend das
      JOIN ad_accounts aa ON aa.id = das.ad_account_id
      WHERE aa.org_id = v_org_id AND das.date = d::date
    ) b ON true
  ) sub;

  SELECT COALESCE(jsonb_agg(daily_val ORDER BY d), '[]'::jsonb)
  INTO v_collect_history
  FROM (
    SELECT d, COALESCE(SUM(pr.amount_bdt), 0) AS daily_val
    FROM generate_series(v_seven_ago, v_today, '1 day'::interval) AS d
    LEFT JOIN payment_requests pr ON pr.status = 'approved'
      AND pr.payment_date = d::date
      AND pr.org_id = v_org_id
    GROUP BY d
  ) sub;

  WITH client_users AS (
    SELECT ur.user_id FROM user_roles ur
    JOIN profiles p ON p.user_id = ur.user_id AND p.org_id = v_org_id
    WHERE ur.role = 'client'
  ),
  client_profiles AS (
    SELECT
      p.user_id, p.full_name, p.email, p.business_name, p.pricing_config,
      p.phone, p.is_active, p.guard_paused_at, p.system_paused_campaigns
    FROM profiles p
    JOIN client_users cu ON cu.user_id = p.user_id
  ),
  client_mappings AS (
    SELECT aac.client_id AS user_id,
           string_agg(DISTINCT aac.mapping_keyword, ' ') AS mapping_keyword
    FROM ad_account_clients aac
    WHERE aac.org_id = v_org_id
      AND aac.mapping_keyword IS NOT NULL
      AND aac.mapping_keyword <> ''
      AND aac.client_id IS NOT NULL
    GROUP BY aac.client_id
  ),
  client_pending_pay AS (
    SELECT pr.client_id AS user_id, count(*) AS pending_payments
    FROM payment_requests pr
    WHERE pr.org_id = v_org_id AND pr.status = 'pending'
    GROUP BY pr.client_id
  ),
  client_txns AS (
    SELECT
      cp.user_id, t.platform,
      COALESCE(SUM(CASE WHEN t.type = 'credit' AND t.status = 'completed' THEN t.amount ELSE 0 END), 0)
        - COALESCE(SUM(CASE WHEN t.type = 'debit'  AND t.status = 'completed' THEN t.amount ELSE 0 END), 0) AS plat_balance
    FROM client_profiles cp
    LEFT JOIN transactions t ON t.client_id = cp.user_id AND t.org_id = v_org_id
    GROUP BY cp.user_id, t.platform
  ),
  client_balances AS (
    SELECT ct.user_id,
           COALESCE(SUM(ct.plat_balance), 0) AS balance,
           COALESCE(jsonb_object_agg(
             ct.platform::text,
             ROUND(ct.plat_balance::numeric, 2)
           ) FILTER (WHERE ct.platform IS NOT NULL), '{}'::jsonb) AS platform_balances
    FROM client_txns ct
    GROUP BY ct.user_id
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'user_id', cp.user_id,
    'full_name', cp.full_name,
    'email', cp.email,
    'business_name', cp.business_name,
    'phone', cp.phone,
    'mapping_keyword', cm.mapping_keyword,
    'is_active', COALESCE(cp.is_active, true),
    'is_paused', (
      cp.guard_paused_at IS NOT NULL
      OR (cp.system_paused_campaigns IS NOT NULL AND jsonb_typeof(cp.system_paused_campaigns) = 'array' AND jsonb_array_length(cp.system_paused_campaigns) > 0)
    ),
    'pending_payments', COALESCE(cpp.pending_payments, 0),
    'balance', ROUND(COALESCE(cb.balance, 0)::numeric, 2),
    'pricing_config', cp.pricing_config,
    'platform_balances', COALESCE(cb.platform_balances, '{}'::jsonb)
  )), '[]'::jsonb)
  INTO v_clients
  FROM client_profiles cp
  LEFT JOIN client_balances cb ON cb.user_id = cp.user_id
  LEFT JOIN client_mappings cm ON cm.user_id = cp.user_id
  LEFT JOIN client_pending_pay cpp ON cpp.user_id = cp.user_id;

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