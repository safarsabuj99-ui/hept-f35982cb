
INSERT INTO settings (key, value)
VALUES ('sync_start_date', '2025-01-01')
ON CONFLICT (key) DO NOTHING;

TRUNCATE daily_ad_spend;
TRUNCATE campaign_performance;
TRUNCATE campaign_mappings;
