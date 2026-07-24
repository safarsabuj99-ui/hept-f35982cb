
CREATE OR REPLACE FUNCTION public.get_active_profitability(
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
  v_wac numeric := 0;
  v_today date := (CURRENT_DATE AT TIME ZONE 'Asia/Dhaka')::date;
  v_by_account jsonb := '[]'::jsonb;
  v_by_client  jsonb := '[]'::jsonb;
  v_totals jsonb;
BEGIN
  SELECT COALESCE(SUM(bdt_amount_paid), 0) / NULLIF(SUM(usd_received), 0)
  INTO v_wac
  FROM usd_purchases
  WHERE org_id = p_org_id AND date >= p_date_from AND date <= p_date_to;

  IF v_wac IS NULL OR v_wac = 0 THEN
    SELECT COALESCE(SUM(bdt_amount_paid), 0) / NULLIF(SUM(usd_received), 0)
    INTO v_wac
    FROM usd_purchases
    WHERE org_id = p_org_id
      AND date >= date_trunc('month', v_today)::date
      AND date <= v_today;
  END IF;

  IF v_wac IS NULL OR v_wac = 0 THEN
    SELECT COALESCE(SUM(bdt_amount_paid), 0) / NULLIF(SUM(usd_received), 0)
    INTO v_wac
    FROM usd_purchases
    WHERE org_id = p_org_id;
  END IF;

  v_wac := COALESCE(v_wac, 0);

  WITH active_camps AS (
    SELECT c.id, c.ad_account_id, c.client_id, c.platform
    FROM campaigns c
    WHERE c.org_id = p_org_id
      AND c.client_id IS NOT NULL
      AND (
        LOWER(c.status) = 'active'
        OR LOWER(c.status) LIKE 'active -%'
        OR LOWER(c.status) = 'enable'
      )
  ),
  spend_rows AS (
    SELECT ac.ad_account_id, ac.client_id, ac.platform, ac.id AS campaign_id,
           COALESCE(SUM(dm.spend), 0) AS spend_usd
    FROM active_camps ac
    LEFT JOIN daily_metrics dm ON dm.campaign_id = ac.id
      AND dm.data_date >= p_date_from AND dm.data_date <= p_date_to
    GROUP BY ac.ad_account_id, ac.client_id, ac.platform, ac.id
  ),
  account_agg AS (
    SELECT
      sr.ad_account_id, sr.client_id, sr.platform,
      SUM(sr.spend_usd) AS spend_usd,
      COUNT(DISTINCT sr.campaign_id) FILTER (WHERE sr.spend_usd > 0) AS active_campaign_count
    FROM spend_rows sr
    GROUP BY sr.ad_account_id, sr.client_id, sr.platform
    HAVING SUM(sr.spend_usd) > 0
  ),
  enriched AS (
    SELECT
      aa.id AS ad_account_id,
      COALESCE(NULLIF(aa.account_name, ''), aa.ad_account_id) AS account_name,
      ag.platform,
      ag.client_id,
      p.full_name AS client_name,
      ag.spend_usd,
      ag.active_campaign_count,
      COALESCE(
        NULLIF((p.pricing_config->'flat_rates'->>ag.platform::text)::numeric, 0),
        NULLIF((p.pricing_config->'platform_rates'->>ag.platform::text)::numeric, 0),
        120
      ) AS rate,
      COALESCE((p.pricing_config->>'percentage')::numeric, 0) AS pct_markup
    FROM account_agg ag
    JOIN ad_accounts aa ON aa.id = ag.ad_account_id
    LEFT JOIN profiles p ON p.user_id = ag.client_id
  ),
  computed AS (
    SELECT
      ad_account_id, account_name, platform, client_id, client_name,
      spend_usd, active_campaign_count, rate,
      (spend_usd * rate) + (spend_usd * (pct_markup/100.0) * rate) AS revenue_bdt,
      (spend_usd * v_wac) AS cogs_bdt
    FROM enriched
  ),
  by_acc AS (
    SELECT
      ad_account_id,
      MAX(account_name) AS account_name,
      MAX(client_id::text) AS client_id,
      MAX(client_name) AS client_name,
      string_agg(DISTINCT platform::text, ',') AS platforms,
      SUM(spend_usd) AS spend_usd,
      SUM(revenue_bdt) AS revenue_bdt,
      SUM(cogs_bdt) AS cogs_bdt,
      SUM(active_campaign_count) AS active_campaign_count
    FROM computed
    GROUP BY ad_account_id
  ),
  by_cli AS (
    SELECT
      client_id,
      MAX(client_name) AS client_name,
      COUNT(DISTINCT ad_account_id) AS active_accounts,
      SUM(spend_usd) AS spend_usd,
      SUM(revenue_bdt) AS revenue_bdt,
      SUM(cogs_bdt) AS cogs_bdt,
      SUM(active_campaign_count) AS active_campaign_count
    FROM computed
    GROUP BY client_id
  )
  SELECT
    (SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'ad_account_id', ad_account_id,
      'account_name', account_name,
      'client_id', client_id,
      'client_name', COALESCE(client_name, 'Unknown'),
      'platforms', platforms,
      'active_campaigns', active_campaign_count,
      'spend_usd', ROUND(spend_usd::numeric, 2),
      'revenue_bdt', ROUND(revenue_bdt::numeric),
      'cogs_bdt', ROUND(cogs_bdt::numeric),
      'profit_bdt', ROUND((revenue_bdt - cogs_bdt)::numeric),
      'margin_pct', CASE WHEN revenue_bdt > 0
        THEN ROUND(((revenue_bdt - cogs_bdt)/revenue_bdt*100)::numeric, 1) ELSE 0 END
    ) ORDER BY (revenue_bdt - cogs_bdt) DESC), '[]'::jsonb) FROM by_acc),
    (SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'client_id', client_id,
      'client_name', COALESCE(client_name, 'Unknown'),
      'active_accounts', active_accounts,
      'active_campaigns', active_campaign_count,
      'spend_usd', ROUND(spend_usd::numeric, 2),
      'revenue_bdt', ROUND(revenue_bdt::numeric),
      'cogs_bdt', ROUND(cogs_bdt::numeric),
      'profit_bdt', ROUND((revenue_bdt - cogs_bdt)::numeric),
      'margin_pct', CASE WHEN revenue_bdt > 0
        THEN ROUND(((revenue_bdt - cogs_bdt)/revenue_bdt*100)::numeric, 1) ELSE 0 END
    ) ORDER BY (revenue_bdt - cogs_bdt) DESC), '[]'::jsonb) FROM by_cli)
  INTO v_by_account, v_by_client;

  SELECT jsonb_build_object(
    'active_accounts', (SELECT COUNT(*) FROM jsonb_array_elements(v_by_account)),
    'active_clients',  (SELECT COUNT(*) FROM jsonb_array_elements(v_by_client)),
    'spend_usd',       COALESCE((SELECT SUM((x->>'spend_usd')::numeric)  FROM jsonb_array_elements(v_by_account) x), 0),
    'revenue_bdt',     COALESCE((SELECT SUM((x->>'revenue_bdt')::numeric) FROM jsonb_array_elements(v_by_account) x), 0),
    'cogs_bdt',        COALESCE((SELECT SUM((x->>'cogs_bdt')::numeric)    FROM jsonb_array_elements(v_by_account) x), 0),
    'profit_bdt',      COALESCE((SELECT SUM((x->>'profit_bdt')::numeric)  FROM jsonb_array_elements(v_by_account) x), 0)
  ) INTO v_totals;

  v_result := jsonb_build_object(
    'wac', ROUND(v_wac::numeric, 2),
    'totals', v_totals,
    'by_account', v_by_account,
    'by_client', v_by_client
  );

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_active_profitability(date, date, uuid) TO authenticated;
