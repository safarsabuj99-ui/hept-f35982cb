
-- Remove duplicate rows from daily_ad_spend, keeping only the latest synced_at per group
DELETE FROM daily_ad_spend
WHERE id NOT IN (
  SELECT DISTINCT ON (ad_account_id, date, campaign_name) id
  FROM daily_ad_spend
  ORDER BY ad_account_id, date, campaign_name, synced_at DESC
);

-- Remove duplicate rows from campaign_performance, keeping only the latest synced_at per group
DELETE FROM campaign_performance
WHERE id NOT IN (
  SELECT DISTINCT ON (campaign_id, date) id
  FROM campaign_performance
  ORDER BY campaign_id, date, synced_at DESC
);

-- Now create unique constraints
ALTER TABLE campaign_performance
  ADD CONSTRAINT uq_campaign_performance_campaign_date
  UNIQUE (campaign_id, date);

ALTER TABLE daily_ad_spend
  ADD CONSTRAINT uq_daily_ad_spend_account_date_campaign
  UNIQUE (ad_account_id, date, campaign_name);
