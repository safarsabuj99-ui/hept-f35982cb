

## Historical Data Sync and Backfill Architecture

### Problem

The current sync system has two critical flaws:
1. **Broken upserts**: The indexes on `(campaign_id, date)` and `(ad_account_id, date)` are regular (non-unique) indexes, so the `.upsert({ onConflict: ... })` calls silently fail and create duplicate rows instead of updating existing ones.
2. **No real API integration for Google/TikTok**: Only Meta fetches real data. The other two platforms use random mock data.
3. **sync-ad-spend uses INSERT, not UPSERT**: Even for Meta, late attribution corrections (e.g., $50 becoming $52) create duplicate rows instead of updating.

### What Changes

**1. Database: Convert indexes to UNIQUE constraints**

Upgrade the existing non-unique indexes to proper unique constraints so upserts work correctly:
- `campaign_performance`: UNIQUE on `(campaign_id, date)` -- ensures one row per campaign per day
- `daily_ad_spend`: UNIQUE on `(ad_account_id, date, campaign_name)` -- ensures one row per account + campaign + day

This is the foundation that makes the entire upsert engine work. Without it, every sync creates duplicates.

**2. Edge Function: `sync-ad-spend/index.ts` -- Smart Upsert for Meta**

Replace the current INSERT logic with UPSERT:
- Keep the existing `time_increment=1` and `date_start` usage (already correct)
- Remove the "skip if exists" check (`existingSet`) -- upsert handles this natively
- Switch from `.insert()` to `.upsert({ onConflict: "ad_account_id,date,campaign_name" })`
- This automatically handles late attribution corrections (Day 1: $50, Day 3: updated to $52)

**3. Edge Function: `sync-fast-lane/index.ts` -- Real API calls per platform**

Replace mock data with real platform API calls, each requesting daily breakdowns:
- **Meta**: Use `/insights?time_increment=1` with `date_start` from response
- **Google Ads**: Include `segments.date` in GAQL query to get per-day rows
- **TikTok**: Use `dimensions=["stat_time_day"]` to get daily granularity
- All platforms upsert on `(ad_account_id, date, campaign_name)` -- the unique constraint prevents duplicates and enables corrections

**4. Edge Function: `sync-deep-dive/index.ts` -- Real campaign-level metrics**

Same pattern but for the `campaign_performance` table:
- **Meta**: Fetch campaign-level insights with `time_increment=1`, map `date_start` to the `date` column
- **Google Ads**: Use `segments.date` + campaign metrics in GAQL
- **TikTok**: Use `dimensions=["stat_time_day"]` with campaign-level reporting
- Upsert on `(campaign_id, date)` -- automatically corrects late-attribution changes

### Technical Details

**Migration SQL:**
```sql
-- Drop old non-unique indexes
DROP INDEX IF EXISTS idx_campaign_perf_campaign_date;
DROP INDEX IF EXISTS idx_daily_ad_spend_account_date;

-- Create unique constraints (enables upsert)
ALTER TABLE campaign_performance
  ADD CONSTRAINT uq_campaign_performance_campaign_date
  UNIQUE (campaign_id, date);

ALTER TABLE daily_ad_spend
  ADD CONSTRAINT uq_daily_ad_spend_account_date_campaign
  UNIQUE (ad_account_id, date, campaign_name);
```

**Upsert pattern (all three functions):**
```typescript
// Instead of INSERT + skip-if-exists:
await supabase.from("daily_ad_spend").upsert(
  {
    ad_account_id: account.id,
    date: row.date_start,  // from API, NOT new Date()
    campaign_name: row.campaign_name,
    raw_spend_amount: parseFloat(row.spend),
    // ...other fields
  },
  { onConflict: "ad_account_id,date,campaign_name", ignoreDuplicates: false }
);
```

**Late attribution correction flow:**
- Day 1 sync: API returns Feb 14 = $50 -> inserted as new row
- Day 3 sync: API returns Feb 14 = $52 -> upsert matches on (campaign_id, Feb 14), updates $50 to $52
- No duplicates, no manual cleanup needed

**API date parameters per platform:**

| Platform | Parameter | Result |
|----------|-----------|--------|
| Meta | `time_increment=1` | Each row has `date_start` = one specific day |
| Google | `segments.date` in GAQL | Each row has `segments.date` = one specific day |
| TikTok | `dimensions=["stat_time_day"]` | Each row has `stat_time_day` = one specific day |

**Files to modify:**
- `supabase/functions/sync-ad-spend/index.ts` -- switch INSERT to UPSERT, remove existingSet logic
- `supabase/functions/sync-fast-lane/index.ts` -- add real API calls with daily breakdown
- `supabase/functions/sync-deep-dive/index.ts` -- add real API calls with campaign-level daily metrics

**Database:** One migration to create the unique constraints.

