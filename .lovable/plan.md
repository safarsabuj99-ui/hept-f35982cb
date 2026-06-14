## Problem

HEPT AGENCY 2 dashboard shows **Spent** populated for every campaign but **Reach, Impressions, CPM, Clicks, CTR, CPC, Results, Cost/Result and ROAS all = 0**. Other ad accounts look correct.

## Root cause

The shared helper `writeFastLaneMetrics` in `supabase/functions/sync-fast-lane/index.ts` (line 90) **inserts new rows into `daily_metrics`** with this payload:

```ts
{ campaign_id, data_date, spend, org_id, synced_at }
```

All other KPI columns (impressions, clicks, reach, results, roas, cpm, conversions, …) get their column DEFAULTs (0) on the INSERT side of the upsert. They only become real numbers later, when `sync-deep-dive` runs for that account and overwrites the row with the full payload.

HEPT AGENCY 2's `sync_account_stats` shows `avg_rows_per_day = 0.14` and `last_full_sync_at` was only set when I forced a manual deep-dive at 10:30 today. That means deep-dive had been skipped on this account for a long time (silent-account gate + the old 6 h heartbeat). Result:

- Fast-lane wrote a `daily_metrics` row for each campaign with `spend > 0`.
- Deep-dive never came along the same day to fill in the rest.
- The dashboard (`/admin/campaigns` → `CampaignMapping.tsx`) reads everything from `daily_metrics`, so it correctly shows `Spent = $3.09` etc. but `Impressions = 0`, `Clicks = 0`, etc.

DB confirms: after this morning's forced deep-dive, today's row for `Arafat/Nakshi/Lajbonti/SS+` now has `spend = 3.17, impressions = 9426, clicks = 138`. The screenshot was captured in the gap between fast-lane and deep-dive.

So this is **not** a "data not collected" bug — it's a "fast-lane creates spend-only rows that look like partial KPIs" bug, made very visible whenever deep-dive lags.

## Fix

### 1. `supabase/functions/sync-fast-lane/index.ts` — make `writeFastLaneMetrics` UPDATE-only

Currently (line 143-152) it upserts into `daily_metrics`. Change it so fast-lane **never inserts** rows it can't fully populate:

- After building `metricRows`, query `daily_metrics` for the `(campaign_id, data_date)` pairs that already exist:
  ```ts
  const { data: existingRows } = await supabase
    .from("daily_metrics")
    .select("campaign_id, data_date")
    .in("campaign_id", metricRows.map(r => r.campaign_id))
    .in("data_date", [...new Set(metricRows.map(r => r.data_date))]);
  const existsKey = new Set((existingRows ?? []).map(r => `${r.campaign_id}|${r.data_date}`));
  ```
- Split `metricRows`:
  - `toUpdate` → key exists → keep current upsert (only `spend`/`synced_at` get updated).
  - `toDefer` → no row yet → skip; log `deferred=${toDefer.length} (awaiting deep-dive)`.
- Only batch-upsert `toUpdate`.

Effect: dashboards no longer show "spend without KPIs". On a fresh day the row appears exactly once — when deep-dive writes it with the complete payload — and fast-lane keeps that row's `spend` fresh between deep-dives.

`daily_ad_spend` continues to receive fast-lane writes unchanged, so wallet debits, finance totals and cash-flow are not affected.

### 2. One-shot backfill for HEPT AGENCY 2

Queue a 7-day deep-dive for ad account `947a3bb4-b647-48f2-84d1-bd8c5c0fc564` so any spend-only `daily_metrics` rows from the past 7 days get their full KPI columns populated. The orchestrator's existing 2 h heartbeat + recent-campaign override (already shipped) will keep it healed going forward.

### Files
- `supabase/functions/sync-fast-lane/index.ts` — update-only behaviour inside `writeFastLaneMetrics`.

### Out of scope
- No DB schema changes.
- No edits to Meta/Google/TikTok report-fetch branches (they share the same helper, which is the right place to fix this).
- No UI changes — once the helper is fixed, the dashboard naturally stops showing partial-KPI rows.

### Deploy
Deploy `sync-fast-lane`, then trigger one 7-day deep-dive for HEPT AGENCY 2 to backfill.
