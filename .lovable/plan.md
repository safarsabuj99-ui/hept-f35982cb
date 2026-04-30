## What's actually wrong

The data mismatch is **not** an exchange-rate or currency bug. It's a **stale-data** bug caused by `sync-deep-dive` aborting mid-execution for TikTok USD accounts (HEPT 15, HEPT 8, etc.).

### Evidence (HEPT 15, 2026-04-29)
| Source | Total spend | Last refresh |
|---|---|---|
| TikTok ad-account UI (truth) | ~85.45 | live |
| `daily_ad_spend` (account-level table, written by Fast-Lane) | 78.45 | 23:45 UTC |
| `daily_metrics` (campaign-level table, written by Deep-Dive — what dashboards read) | **66.02** | **stuck at 14:16 UTC** |

Per-campaign comparison shows every campaign in `daily_metrics` is ~30% lower than the same campaign in `daily_ad_spend`, with synced_at frozen at 14:16 — i.e. yesterday afternoon's snapshot, never refreshed for the rest of the day.

### Root cause

`sync_account_stats.last_error = "The signal has been aborted"` for HEPT 15 and HEPT AGENCY 2. Deep-dive jobs are completing as `done` with `rows_synced: 0` because the TikTok branch is hitting the 22-second edge-function timeout **after** fetching/parsing data but **before** finishing the per-row upserts.

What inflated runtime past the budget:
1. The recent Sales-preset fix added 5 extra TikTok metric fields (`total_view_content`, `total_add_to_cart`, `total_initiate_checkout`, `total_complete_payment`, `cost_per_complete_payment`) → larger API responses, more parsing.
2. TikTok status fetch is a separate sequential request before the metrics loop.
3. Each row does 3 sequential awaits: `upsertCampaign` → `campaign_mappings.upsert` → `upsertMetrics` (+ legacy `campaign_performance.upsert`). For 50+ active campaigns this serial chain blows the budget.
4. Result: first half of campaigns get fresh writes (synced_at 14:16, when the day only had 66.02 of spend); after timeout, no further writes for the rest of the day.

The smaller mismatch between `daily_ad_spend` (78.45) and TikTok UI (85.45) is the keyword-skip filter — campaigns whose names don't match any client's `mapping_keyword` are skipped on purpose. That is a separate, intended behaviour and is **not** changed by this fix.

## Fix plan (no functional regressions)

All changes are inside `supabase/functions/sync-deep-dive/index.ts`, TikTok branch only. No schema changes, no behaviour change for Meta/Google.

### 1. Parallelize the per-row write chain
Replace the sequential `upsertCampaign → campaign_mappings.upsert → upsertMetrics → campaign_performance.upsert` per-row loop with a batched approach:

```text
phase A (sequential, fast): upsertCampaign for each row → collect campaignDbId
phase B (parallel, capped): Promise.allSettled in batches of 5:
        - campaign_mappings.upsert
        - upsertMetrics
        - campaign_performance.upsert
```

This matches the existing memory rule ("process concurrent ops via Promise.allSettled batches of 5") and typically cuts the per-account TikTok loop time by 60-70%.

### 2. Bulk the `campaign_mappings` upserts
Today every row does its own `upsert`. Collect them into an array and do **one** `.upsert(arr, { onConflict: "campaign_id" })` per account at the end — same idempotent result, single round trip.

### 3. Bulk the `campaign_performance` legacy writes
Same pattern — accumulate the legacy rows and bulk-upsert at the end of the TikTok branch.

### 4. Per-account soft time budget
Add an elapsed check (`Date.now() - startTime > 18000ms`) at the top of each per-account iteration. If exceeded, skip the remaining accounts and let the next 15-min orchestrator run pick them up. Currently a timeout aborts mid-write and corrupts partial state; this turns it into a clean, resumable boundary.

### 5. Reduce sales-funnel field fetch where unused
Conditionally request `total_view_content / total_add_to_cart / total_initiate_checkout` only when the account has at least one campaign with objective `WEB_CONVERSIONS / PRODUCT_SALES`. Always fetch `total_complete_payment` + `cost_per_complete_payment` (cheap and used by KPIs). For non-sales accounts this trims ~30% off the response payload.

### 6. Backfill today's stale data after deploy
Once the function is deployed, manually invoke `sync-deep-dive` for the affected TikTok accounts (HEPT 15, HEPT 8, HEPT AGENCY 2, HEPT AGENCY 3) with `date_from = today` to immediately reconcile the visible numbers without waiting for the next 15-min cycle.

## What this does NOT change
- Meta and Google sync paths are untouched.
- The keyword-mapping skip (`if (!clientId) continue`) stays — that's an intentional product rule, not a bug.
- `daily_ad_spend` writers (Fast-Lane) are untouched.
- BDT→USD conversion logic is untouched (BDT accounts are correct, verified above with rate 119).
- Auth, RLS, schema, edge-function config — all untouched.

## Files to edit
- `supabase/functions/sync-deep-dive/index.ts` — TikTok branch only (~lines 690-960).

## Verification after deploy
1. Deploy function, manually trigger sync-deep-dive for the four TikTok accounts.
2. Re-run the comparison query: `daily_metrics.spend` per campaign for `data_date = today` should match `daily_ad_spend.final_billable_usd` within rounding (sub-cent).
3. Check `sync_account_stats.last_error` — should clear (no more "signal has been aborted").
4. Confirm `synced_at` on `daily_metrics` keeps advancing every 15 min instead of freezing.
