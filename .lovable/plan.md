

# High-Precision Ad Data Sync & Aggregation Engine

## Overview

This plan restructures the data sync pipeline to eliminate duplicate rows, enforce per-client start dates and filter tags, lock campaign identity by platform ID, and aggregate daily metrics in the frontend so users see one row per campaign (not one row per day).

---

## Part 1: Database Schema Changes

### 1A. Add columns to `profiles` table (client config)

Instead of creating a new `clients` table, we add three columns to the existing `profiles` table (which already stores client-specific settings like `mapping_keyword`, `custom_exchange_rate`):

- `ad_account_filter_tag` (text, nullable) -- e.g. "[ASIF]". Only sync campaigns whose name contains this tag.
- `data_fetch_start_date` (date, nullable) -- Per-client override of global `sync_start_date`. Ignore API data before this date.
- `preferred_timezone` (text, default 'Asia/Dhaka') -- For date normalization during sync.

### 1B. Create `campaigns` table (the parent identity store)

A new table that locks campaign identity by platform ID:

| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | Internal ID |
| platform_id | text (unique) | External platform ID (e.g. "meta_123456") |
| name | text | Current name from API |
| original_name_tag | text | Snapshot of the name at first discovery -- locks the filter-tag match even if renamed |
| platform | enum | meta / tiktok / google |
| status | text | active / paused / removed |
| ad_account_id | uuid | FK to ad_accounts |
| client_id | uuid, nullable | Resolved client |
| created_at | timestamptz | |
| updated_at | timestamptz | |

Unique constraint on `platform_id`. RLS policies mirroring `campaign_performance`.

### 1C. Create `daily_metrics` table (child data)

| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | |
| campaign_id | uuid | FK to campaigns.id |
| data_date | date | The actual platform date |
| spend | numeric | |
| impressions | bigint | |
| clicks | bigint | |
| results | integer | |
| conversion_value | numeric | |
| ctr | numeric | |
| cpc | numeric | |
| roas | numeric | |
| synced_at | timestamptz | |

Composite unique index on `(campaign_id, data_date)` to enable upserts and prevent duplicates. RLS policies via campaign -> ad_account -> ad_account_clients chain.

### 1D. Migration strategy

The old `campaign_performance` and `daily_ad_spend` tables remain untouched initially. New sync writes to the new tables. Once validated, old tables can be deprecated.

---

## Part 2: Backend -- Rewritten `sync-deep-dive` Edge Function

The current function iterates by ad_account. The new version adds per-client config awareness.

### Sync Flow (per ad account):

1. **Load client configs**: For each client linked to this ad account (via `ad_account_clients`), load their `ad_account_filter_tag`, `data_fetch_start_date`, and `preferred_timezone` from `profiles`.

2. **Determine date range**: Use the most restrictive of `MAX(client.data_fetch_start_date, global sync_start_date)` as the start, and today as the end.

3. **API request**: Same as current (Meta Insights with `time_increment=1`, Google with `segments.date`, TikTok with `stat_time_day`).

4. **Filter by tag (Step A)**: If a client has `ad_account_filter_tag`, only process campaigns whose name contains that tag. Campaigns not matching any client's tag are skipped.

5. **ID Locking (Step B)**:
   - Build `platform_id` (e.g. `meta_{campaign_id}`).
   - Check if `platform_id` exists in `campaigns` table.
   - If yes: update `name` and `status` (but keep `original_name_tag` unchanged).
   - If no: insert new row, setting both `name` and `original_name_tag` to the current name.

6. **Timezone-aware date mapping**: Convert the API's `date_start` / `segments.date` / `stat_time_day` to the client's `preferred_timezone` before writing to `daily_metrics.data_date`.

7. **Upsert daily metrics**: Using the composite unique index `(campaign_id, data_date)`. If Feb 10 data already exists, it gets updated in place -- no duplicate rows.

### Sync Flow Diagram

The function processes: Ad Account -> API Call -> Filter by Tag -> Lock Campaign ID -> Convert Timezone -> Upsert Metrics.

---

## Part 3: Frontend -- Dynamic Aggregation

### 3A. ClientReports page changes

Currently `ClientReports.tsx` fetches raw `campaign_performance` rows and aggregates in JS by `campaign_id`. The new version will:

1. Query from `daily_metrics` joined with `campaigns` instead.
2. Apply date filtering server-side with `.gte('data_date', start).lte('data_date', end)`.
3. Continue client-side aggregation via `useMemo` (grouping by `campaign_id`) -- this is already the pattern used, just pointed at the new tables.

The key fix: since `daily_metrics` has the composite unique constraint, there will never be duplicate rows for the same campaign+date, so the aggregation produces exactly one summary row per campaign.

### 3B. SpendReport page changes

Same pattern: query `daily_metrics` joined with `campaigns`, aggregate by campaign for the selected date range.

### 3C. Admin ClientDetail Spend tab

Update to read from the new `daily_metrics` + `campaigns` tables.

---

## Part 4: Admin UI -- Client Config Fields

### In ClientDetail page (Profile tab):

Add three new fields to the existing profile editor:

- **Filter Tag** -- text input for `ad_account_filter_tag` (e.g. "[ASIF]")
- **Data Start Date** -- date picker for `data_fetch_start_date`
- **Timezone** -- dropdown for `preferred_timezone` with common options (Asia/Dhaka, UTC, America/New_York, etc.)

These get saved alongside existing profile fields.

---

## Technical Summary of Changes

| Area | Files Changed |
|------|--------------|
| Database | 1 migration: add `profiles` columns, create `campaigns` table, create `daily_metrics` table with indexes and RLS |
| Edge Function | `supabase/functions/sync-deep-dive/index.ts` -- full rewrite with tag filtering, ID locking, timezone conversion |
| Edge Function | `supabase/functions/sync-fast-lane/index.ts` -- update to write to new tables |
| Frontend | `src/pages/ClientReports.tsx` -- query new tables |
| Frontend | `src/pages/SpendReport.tsx` -- query new tables |
| Frontend | `src/pages/ClientDetail.tsx` -- add filter tag, start date, timezone fields |
| Frontend | `src/components/client-analytics/DeepDiveTable.tsx` -- no structural change needed |

