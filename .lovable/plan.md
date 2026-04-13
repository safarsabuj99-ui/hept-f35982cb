

## Plan: Fix Missing Spend Data by Adding org_id to Sync Functions

### Root Cause
Both sync edge functions (`sync-deep-dive` and `sync-fast-lane`) write to spend/metrics tables **without setting `org_id`**. Since RLS requires `org_id = get_user_org_id(auth.uid())`, these records are invisible to the admin dashboard.

**Current NULL org_id counts:**
- `daily_metrics`: 32 records (all from today, 2026-04-14)
- `campaign_performance`: 32 records
- `daily_ad_spend`: 19 records

Every future sync creates more invisible data, so spend always appears as $0 for the current day.

### Why Previous Triggers Don't Help
The existing `set_org_id_from_auth()` trigger pattern uses `auth.uid()` — but edge functions run with a **service role key** where `auth.uid()` is NULL. These sync functions must explicitly set `org_id` from the ad account data they already have.

### Fix — Three Parts

#### 1. Update `sync-deep-dive` edge function
- Add `org_id` to the `ad_accounts` SELECT query
- Pass `org_id` into every `daily_metrics` upsert
- Pass `org_id` into every `campaign_performance` upsert
- Pass `org_id` into every `campaigns` insert

#### 2. Update `sync-fast-lane` edge function
- Add `org_id` to the `ad_accounts` SELECT query
- Pass `org_id` into every `daily_ad_spend` upsert

#### 3. Backfill + add database triggers
One migration to:
- Backfill 32 NULL `daily_metrics` rows, 32 NULL `campaign_performance` rows, and 19 NULL `daily_ad_spend` rows with the correct org_id (looked up from related ad account/campaign)
- Add `BEFORE INSERT OR UPDATE` triggers on these 3 tables that auto-populate `org_id` from the related campaign/ad_account as a safety net

### Files Changed
| Action | File |
|--------|------|
| Modify | `supabase/functions/sync-deep-dive/index.ts` — add org_id to queries and all upserts |
| Modify | `supabase/functions/sync-fast-lane/index.ts` — add org_id to queries and all upserts |
| Migration | Backfill NULL org_id + add triggers on daily_metrics, campaign_performance, daily_ad_spend |

### Expected Result
- Today's spend data immediately visible on dashboard after backfill
- All future syncs write org_id correctly
- Triggers provide a safety net for any code path that forgets org_id

