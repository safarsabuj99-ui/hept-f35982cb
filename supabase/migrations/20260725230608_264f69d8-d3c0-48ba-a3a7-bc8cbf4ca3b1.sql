
-- Helper index for fast "spent recently" lookups
CREATE INDEX IF NOT EXISTS idx_daily_metrics_campaign_date_spend
  ON public.daily_metrics(campaign_id, data_date)
  WHERE spend > 0;

CREATE OR REPLACE FUNCTION public.get_active_entities_overview(
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
  v_today date := (CURRENT_DATE AT TIME ZONE 'Asia/Dhaka')::date;
  v_wac numeric := 0;
  v_by_client jsonb := '[]'::jsonb;
  v_by_account jsonb := '[]'::jsonb;
  v_result jsonb;
BEGIN
  -- WAC (same fallback chain as get_active_profitability)
  SELECT COALESCE(SUM(bdt_amount_paid), 0) / NULLIF(SUM(usd_received), 0)
  INTO v_wac
  FROM usd_purchases
  WHERE org_id = p_org_id AND date >= p_date_from AND date <= p_date_to;

  IF v_wac IS NULL OR v_wac = 0 THEN
    SELECT COALESCE(SUM(bdt_amount_paid), 0) / NULLIF(SUM(usd_received), 0)
    INTO v_wac FROM usd_purchases
    WHERE org_id = p_org_id AND date >= date_trunc('month', v_today)::date AND date <= v_today;
  END IF;

  IF v_wac IS NULL OR v_wac = 0 THEN
    SELECT COALESCE(SUM(bdt_amount_paid), 0) / NULLIF(SUM(usd_received), 0)
    INTO v_wac FROM usd_purchases WHERE org_id = p_org_id;
  END IF;

  v_wac := COALESCE(v_wac, 0);

  WITH active_camps AS (
    -- active status AND spend in last 7d
    SELECT c.id, c.ad_account_id, c.client_id, c.platform
    FROM campaigns c
    WHERE c.org_id = p_org_id
      AND c.client_id IS NOT NULL
      AND (
        LOWER(c.status) = 'active'
        OR LOWER(c.status) LIKE 'active -%'
        OR LOWER(c.status) = 'enable'
      )
      AND EXISTS (
        SELECT 1 FROM daily_metrics dm
        WHERE dm.campaign_id = c.id
          AND dm.data_date >= (v_today - INTERVAL '6 days')::date
          AND dm.data_date <= v_today
          AND dm.spend > 0
      )
  ),
  spend_windows AS (
    SELECT
      dm.campaign_id,
      SUM(CASE WHEN dm.data_date = v_today THEN dm.spend ELSE 0 END) AS s_today,
      SUM(CASE WHEN dm.data_date >= (v_today - INTERVAL '6 days')::date  THEN dm.spend ELSE 0 END) AS s_7d,
      SUM(CASE WHEN dm.data_date >= (v_today - INTERVAL '29 days')::date THEN dm.spend ELSE 0 END) AS s_30d,
      SUM(CASE WHEN dm.data_date >= p_date_from AND dm.data_date <= p_date_to THEN dm.spend ELSE 0 END) AS s_range
    FROM daily_metrics dm
    WHERE dm.campaign_id IN (SELECT id FROM active_camps)
      AND dm.data_date >= (v_today - INTERVAL '29 days')::date
    GROUP BY dm.campaign_id
  ),
  camp_full AS (
    SELECT ac.*,
      COALESCE(sw.s_today, 0)  AS s_today,
      COALESCE(sw.s_7d, 0)     AS s_7d,
      COALESCE(sw.s_30d, 0)    AS s_30d,
      COALESCE(sw.s_range, 0)  AS s_range
    FROM active_camps ac
    LEFT JOIN spend_windows sw ON sw.campaign_id = ac.id
  ),
  -- Wallet USD per client (completed transactions only)
  wallet AS (
    SELECT
      t.client_id,
      SUM(
        CASE WHEN t.type = 'credit' THEN t.amount
             WHEN t.type = 'debit'  THEN -t.amount
             ELSE 0 END
      ) AS wallet_usd
    FROM transactions t
    WHERE t.org_id = p_org_id
      AND COALESCE(t.status, 'completed') = 'completed'
      AND t.client_id IN (SELECT DISTINCT client_id FROM active_camps)
    GROUP BY t.client_id
  ),
  -- Per-client pricing (rate + markup) for revenue calc, per-platform
  camp_priced AS (
    SELECT
      cf.*,
      COALESCE(
        NULLIF((p.pricing_config->'flat_rates'->>cf.platform::text)::numeric, 0),
        NULLIF((p.pricing_config->'platform_rates'->>cf.platform::text)::numeric, 0),
        120
      ) AS rate,
      COALESCE((p.pricing_config->>'percentage')::numeric, 0) AS pct_markup,
      p.full_name AS client_name
    FROM camp_full cf
    LEFT JOIN profiles p ON p.user_id = cf.client_id
  ),
  by_account_raw AS (
    SELECT
      cp.ad_account_id,
      MAX(cp.client_id::text) AS client_id,
      MAX(cp.client_name) AS client_name,
      string_agg(DISTINCT cp.platform::text, ',') AS platforms,
      COUNT(DISTINCT cp.id) AS active_campaigns,
      SUM(cp.s_today) AS s_today,
      SUM(cp.s_7d)    AS s_7d,
      SUM(cp.s_30d)   AS s_30d,
      SUM(cp.s_range) AS s_range,
      SUM((cp.s_range * cp.rate) + (cp.s_range * (cp.pct_markup/100.0) * cp.rate)) AS revenue_bdt,
      SUM(cp.s_range * v_wac) AS cogs_bdt
    FROM camp_priced cp
    GROUP BY cp.ad_account_id
  ),
  by_client_raw AS (
    SELECT
      cp.client_id,
      MAX(cp.client_name) AS client_name,
      COUNT(DISTINCT cp.ad_account_id) AS active_accounts,
      COUNT(DISTINCT cp.id) AS active_campaigns,
      SUM(cp.s_today) AS s_today,
      SUM(cp.s_7d)    AS s_7d,
      SUM(cp.s_30d)   AS s_30d,
      SUM(cp.s_range) AS s_range,
      SUM((cp.s_range * cp.rate) + (cp.s_range * (cp.pct_markup/100.0) * cp.rate)) AS revenue_bdt,
      SUM(cp.s_range * v_wac) AS cogs_bdt
    FROM camp_priced cp
    GROUP BY cp.client_id
  )
  SELECT
    (SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'client_id', bc.client_id,
      'client_name', COALESCE(bc.client_name, 'Unknown'),
      'active_accounts', bc.active_accounts,
      'active_campaigns', bc.active_campaigns,
      'spend_today', ROUND(bc.s_today::numeric, 2),
      'spend_7d',    ROUND(bc.s_7d::numeric, 2),
      'spend_30d',   ROUND(bc.s_30d::numeric, 2),
      'wallet_usd',  ROUND(COALESCE(w.wallet_usd, 0)::numeric, 2),
      'runway_days', CASE
        WHEN bc.s_7d > 0 AND COALESCE(w.wallet_usd, 0) > 0
        THEN ROUND((COALESCE(w.wallet_usd, 0) / (bc.s_7d / 7.0))::numeric, 1)
        ELSE NULL END,
      'profit_bdt', ROUND((bc.revenue_bdt - bc.cogs_bdt)::numeric),
      'margin_pct', CASE WHEN bc.revenue_bdt > 0
        THEN ROUND(((bc.revenue_bdt - bc.cogs_bdt)/bc.revenue_bdt*100)::numeric, 1) ELSE 0 END
    ) ORDER BY bc.s_7d DESC), '[]'::jsonb)
     FROM by_client_raw bc LEFT JOIN wallet w ON w.client_id = bc.client_id::uuid),
    (SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'ad_account_id', ba.ad_account_id,
      'account_name', COALESCE(NULLIF(aa.account_name,''), aa.ad_account_id),
      'client_id', ba.client_id,
      'client_name', COALESCE(ba.client_name, 'Unknown'),
      'platforms', ba.platforms,
      'active_campaigns', ba.active_campaigns,
      'spend_today', ROUND(ba.s_today::numeric, 2),
      'spend_7d',    ROUND(ba.s_7d::numeric, 2),
      'spend_30d',   ROUND(ba.s_30d::numeric, 2),
      'profit_bdt', ROUND((ba.revenue_bdt - ba.cogs_bdt)::numeric),
      'margin_pct', CASE WHEN ba.revenue_bdt > 0
        THEN ROUND(((ba.revenue_bdt - ba.cogs_bdt)/ba.revenue_bdt*100)::numeric, 1) ELSE 0 END
    ) ORDER BY ba.s_7d DESC), '[]'::jsonb)
     FROM by_account_raw ba LEFT JOIN ad_accounts aa ON aa.id = ba.ad_account_id)
  INTO v_by_client, v_by_account;

  v_result := jsonb_build_object(
    'wac', ROUND(v_wac::numeric, 2),
    'totals', jsonb_build_object(
      'active_clients',   (SELECT COUNT(*) FROM jsonb_array_elements(v_by_client)),
      'active_accounts',  (SELECT COUNT(*) FROM jsonb_array_elements(v_by_account)),
      'spend_today_usd',  COALESCE((SELECT SUM((x->>'spend_today')::numeric) FROM jsonb_array_elements(v_by_client) x), 0),
      'spend_7d_usd',     COALESCE((SELECT SUM((x->>'spend_7d')::numeric)    FROM jsonb_array_elements(v_by_client) x), 0),
      'spend_30d_usd',    COALESCE((SELECT SUM((x->>'spend_30d')::numeric)   FROM jsonb_array_elements(v_by_client) x), 0)
    ),
    'by_client',  v_by_client,
    'by_account', v_by_account
  );

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_active_entities_overview(date, date, uuid) TO authenticated;
