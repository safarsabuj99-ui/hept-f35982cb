

## Plan: Harden RLS Policies to Prevent Cross-Client Data Leakage

### Problem

Current client-facing RLS policies on `campaigns`, `daily_metrics`, `campaign_performance`, and `daily_ad_spend` use `ad_account_id IN (SELECT ... FROM ad_account_clients WHERE client_id = auth.uid())`. This means if two clients share the same ad account, both can see ALL data on that account — including each other's campaigns and metrics.

### Fix

Replace the `ad_account_id`-based subqueries with direct `client_id = auth.uid()` checks where the column exists, and join through `campaigns.client_id` for `daily_metrics`.

#### 1. `campaigns` table

**Current** `client_read_own_campaigns`:
```sql
ad_account_id IN (SELECT aac.ad_account_id FROM ad_account_clients aac WHERE aac.client_id = auth.uid())
```

**New**:
```sql
client_id = auth.uid()
```

#### 2. `campaign_performance` table

**Current** `client_read_own_campaign_performance`:
```sql
ad_account_id IN (SELECT aac.ad_account_id FROM ad_account_clients aac WHERE aac.client_id = auth.uid())
```

**New**:
```sql
client_id = auth.uid()
```

Already has a `client_id` column — just use it directly.

#### 3. `daily_metrics` table

**Current** `client_read_own_daily_metrics`:
```sql
campaign_id IN (SELECT c.id FROM campaigns c JOIN ad_account_clients aac ON aac.ad_account_id = c.ad_account_id WHERE aac.client_id = auth.uid())
```

**New**:
```sql
campaign_id IN (SELECT c.id FROM campaigns c WHERE c.client_id = auth.uid())
```

No `client_id` column on `daily_metrics`, so we join through `campaigns.client_id` instead of going through `ad_account_clients`.

#### 4. `daily_ad_spend` table

**Current** `client_read_own_daily_ad_spend`:
```sql
ad_account_id IN (SELECT aac.ad_account_id FROM ad_account_clients aac WHERE aac.client_id = auth.uid())
```

This table has no `client_id` column but has `campaign_name`. The safest approach: create a security-definer helper that checks if the `campaign_name` matches any keyword assigned to the requesting user, OR add a `client_id` column to `daily_ad_spend`.

**Decision**: Add a `client_id` column to `daily_ad_spend` (the sync engine already knows the client when writing rows), then filter by `client_id = auth.uid()`.

#### 5. Manager policies — same pattern

Update the manager policies on all 4 tables to use `client_id`-based checks instead of `ad_account_id` subqueries through `ad_account_clients`.

### Migration SQL (single migration)

1. Add `client_id` column to `daily_ad_spend` (nullable, uuid)
2. Drop and recreate 8 RLS policies (client + manager on each of the 4 tables)
3. Backfill `daily_ad_spend.client_id` from existing campaign keyword matches

### Sync Function Update

Update `sync-ad-spend` to write `client_id` when inserting `daily_ad_spend` rows (it already resolves the client during keyword matching).

### Files Changed

| File | Change |
|------|--------|
| Database migration | Add `client_id` to `daily_ad_spend`, replace 8 RLS policies |
| `supabase/functions/sync-ad-spend/index.ts` | Write `client_id` when upserting `daily_ad_spend` rows |

