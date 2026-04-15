

## Plan: Fix Campaign Client Attribution & Ensure Data Accuracy

### Problem Found

**23 campaigns** have `client_id` referencing users that no longer exist in profiles (ghost references from deleted accounts). **19 campaigns** have `client_id` that doesn't match their keyword mapping. However, none of these campaigns have actual spend data yet, so **client balances and transactions are NOT affected**.

The risk is **future spend** on these campaigns would be attributed to the wrong client and debited incorrectly.

### Root Cause

When `sync-deep-dive` runs, it correctly sets `campaigns.client_id` via keyword matching. But campaigns created before the keyword system was set up, or where the old client was deleted, retain stale `client_id` values. The sync only updates campaigns that return data from the platform API — dormant campaigns never get corrected.

### Actions

**1. SQL Migration: Repair all campaign client_id values**

Update every campaign's `client_id` to match the correct keyword-mapped client. This handles both ghost references and mismatches in one pass:

```sql
UPDATE campaigns c
SET client_id = matched.correct_client_id,
    updated_at = NOW()
FROM (
  SELECT DISTINCT ON (c2.id) c2.id as campaign_id, aac.client_id as correct_client_id
  FROM campaigns c2
  JOIN ad_account_clients aac 
    ON aac.ad_account_id = c2.ad_account_id 
    AND aac.mapping_keyword != ''
    AND LOWER(c2.name) LIKE '%' || LOWER(aac.mapping_keyword) || '%'
  ORDER BY c2.id
) matched
WHERE c.id = matched.campaign_id
  AND (c.client_id IS NULL OR c.client_id != matched.correct_client_id);
```

**2. Fix daily_ad_spend client_id** (same logic for spend attribution table)

```sql
UPDATE daily_ad_spend das
SET client_id = matched.correct_client_id
FROM (
  SELECT DISTINCT ON (das2.id) das2.id, aac.client_id as correct_client_id
  FROM daily_ad_spend das2
  JOIN ad_account_clients aac 
    ON aac.ad_account_id = das2.ad_account_id 
    AND aac.mapping_keyword != ''
    AND LOWER(das2.campaign_name) LIKE '%' || LOWER(aac.mapping_keyword) || '%'
  ORDER BY das2.id
) matched
WHERE das.id = matched.id
  AND (das.client_id IS NULL OR das.client_id != matched.correct_client_id);
```

**3. Re-trigger `auto-snapshot-usd`** to recalculate metrics with corrected attribution.

### What this prevents going forward

The existing `sync-deep-dive` already applies keyword matching on every run (line 266: `client_id: clientId`). The `sync-fast-lane` also matches correctly for `daily_ad_spend`. This repair catches the historical backlog that was never re-synced. Future syncs will continue to maintain correct attribution automatically.

### Files Changed

| Action | Detail |
|--------|--------|
| Migration | Fix `campaigns.client_id` for 42 campaigns (23 ghost + 19 mismatch) |
| Migration | Fix `daily_ad_spend.client_id` alignment |
| Test | Invoke `auto-snapshot-usd` to verify |

