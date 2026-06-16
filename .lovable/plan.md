# Why today shows $0 on the dashboard

Root cause confirmed against the database:

- `daily_ad_spend` **has** today's (2026-06-17) Meta rows — Meta API returned them and fast-lane wrote them there.
- `daily_metrics` **does not** have any 06-17 row — the dashboard's `todaySpend`, sparkline, and Profit/Loss all read from `daily_metrics`, so they show ৳0 / $0.
- The dashboard "Today" filter uses Asia/Dhaka, so it asks for 06-17, which doesn't exist yet → ৳0.

The bug lives in `supabase/functions/sync-fast-lane/index.ts → writeFastLaneMetrics()`:

```ts
// UPDATE-only: never insert spend-only rows into daily_metrics.
// Deep-dive owns row creation...
const toUpdate = metricRows.filter(r => existsKey.has(`${r.campaign_id}|${r.data_date}`));
```

Fast-lane intentionally **refuses to insert** new `(campaign_id, data_date)` rows and defers to deep-dive. Deep-dive only chunks **past** windows, so today's row never gets created until tomorrow. Result: every new day starts with the admin dashboard stuck at $0 until deep-dive catches up. This was added to avoid a "spend populated but impressions=0" cosmetic bug, but it broke the primary dashboard KPI.

# Fix plan (smart + future-proof)

### 1. Let fast-lane INSERT today/yesterday in `daily_metrics`
`writeFastLaneMetrics` will UPSERT (insert-on-missing) only for the **last 2 days in Asia/Dhaka** (today + yesterday). Older missing days keep deferring to deep-dive, so the original "impressions=0 forever on old rows" concern stays solved. Newly-inserted rows are marked as fast-lane-seeded so deep-dive will fully overwrite them on its next pass with full KPIs.

### 2. Auto-schedule a deep-dive for today after every fast-lane run
At the end of `sync-fast-lane`, enqueue a `sync-deep-dive` job for `date_from = date_to = Dhaka today` for any account that wrote new spend. This way KPIs (impressions, clicks, results) get filled in within minutes instead of waiting for the next scheduled deep-dive.

### 3. Safety net inside `get_admin_dashboard_summary`
If `daily_metrics` returns 0 for the requested range AND `daily_ad_spend` has rows for that range on the mapped accounts, the RPC will fall back to `SUM(daily_ad_spend.final_billable_usd)` for `todaySpend` and the sparkline. This guarantees the dashboard can never silently show $0 while billing data already exists — even if fast-lane regressed again.

### 4. Detection so this never goes unnoticed
Add a small daily check (extend existing `sync_integrity_alerts`): for each mapped account, if `daily_ad_spend` for a date has rows but `daily_metrics` for the same date/account has none, write a `metrics_gap` alert. Surfaces silently broken syncs in the Sync Health page.

### 5. Backfill today right now
After deploy, trigger `sync-fast-lane` once (which will INSERT today's rows) and one targeted `sync-deep-dive` for 06-17 so the dashboard repopulates immediately.

# Technical detail

Files changed:
- `supabase/functions/sync-fast-lane/index.ts`
  - In `writeFastLaneMetrics`: compute `dhakaToday` and `dhakaYesterday`; split `metricRows` into `recentRows` (data_date ∈ {today, yesterday}) and `historicalRows`. UPSERT `recentRows` directly with `onConflict: campaign_id,data_date`. Keep UPDATE-only behavior for `historicalRows`. Log counts per bucket.
  - After the per-account loop, if any account wrote recent rows, insert a `sync_jobs` row for `sync-deep-dive` with `date_from = date_to = dhakaToday` (deduped against existing pending/processing jobs).
- `supabase/migrations/<new>.sql`
  - Update `get_admin_dashboard_summary(p_date_from, p_date_to[, p_org_id])` so `v_range_spend` and `v_spend_history` fall back to `daily_ad_spend.final_billable_usd` scoped to `v_mapped_account_ids` when the `daily_metrics` sum is 0 for a given day. Keep `v_yesterday_spend` consistent.
  - Add a nightly check (or extend existing trigger) that writes a `sync_integrity_alerts` row of type `metrics_gap` when `daily_ad_spend` has a date covered for an account but `daily_metrics` has zero rows for that account/date.
- After deploy: call `sync-fast-lane` once, then enqueue one `sync-deep-dive` job for today, verify `daily_metrics` has 06-17 rows, then confirm the dashboard "Today" KPI is non-zero.

# Prevention recap
- Today's spend can no longer be "invisible": fast-lane writes the row instead of deferring.
- Even if fast-lane regresses, the RPC falls back to `daily_ad_spend`, so the dashboard always reflects real billing.
- Any account with billing rows but no metric rows fires a `metrics_gap` alert, so silent drift is caught the same day.
