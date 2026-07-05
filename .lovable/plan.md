## Goal
Make every metric in the app — especially the "Results" column — return the exact same number the advertiser sees natively inside **Meta Ads Manager**, **TikTok Ads Manager**, and **Google Ads**, using each campaign/ad-set's real optimization goal. No extras, no drift.

## Root cause of current mismatch

Today `sync-deep-dive` derives "Results" from the **campaign objective** and hard-codes which action_type = results (e.g. sales → `omni_purchase`, messages → `messaging_conversation_started_7d`). Real ad platforms compute Results from the **ad-set / ad-group `optimization_goal` + `promoted_object` + attribution window** — not the campaign objective. Because those inputs are never fetched, our number drifts vs. Ads Manager, and platform-specific columns (Meta cost-per-result, TikTok `real_time_result_rate`, Google `all_conversions`, frequency, etc.) are missing entirely.

## Plan — 3 platform-parity passes

### 1. Meta (Facebook / Instagram)

**Fetch new data (deep-dive):**
- `GET /{ad_account_id}/adsets?fields=id,campaign_id,optimization_goal,billing_event,promoted_object{pixel_id,custom_event_type,application_id,page_id}` — build `adsetGoalMap[campaign_id]` = the dominant `optimization_goal` + `custom_event_type` for the campaign (fallback: first adset).
- Add `use_account_attribution_setting=true` and `use_unified_attribution_setting=true` to the `/insights` call so numbers match the Ads Manager default view exactly.
- Extend `fields=` on `/insights` with: `frequency, cost_per_action_type, cost_per_unique_action_type, cost_per_conversion, purchase_roas, website_purchase_roas, video_p25_watched_actions, video_p50_watched_actions, video_p75_watched_actions, video_p100_watched_actions, video_play_actions, inline_link_clicks, unique_clicks, quality_ranking, engagement_rate_ranking, conversion_rate_ranking, objective`.

**Results derivation (replaces current objective-map switch):**
- Build a deterministic `optimizationGoal → action_type` map that mirrors Ads Manager exactly:
  - `OFFSITE_CONVERSIONS` / `CONVERSIONS` → `promoted_object.custom_event_type` (e.g. `PURCHASE` → `offsite_conversion.fb_pixel_purchase`; `LEAD` → `offsite_conversion.fb_pixel_lead`; etc.)
  - `LEAD_GENERATION` → `leadgen.other` (fallback `onsite_conversion.lead_grouped`)
  - `LINK_CLICKS` → `link_click`
  - `POST_ENGAGEMENT` → `post_engagement`
  - `PAGE_LIKES` → `like`
  - `REACH` → row-level `reach`
  - `IMPRESSIONS` → row-level `impressions`
  - `THRUPLAY` → `video_thruplay_watched_actions`
  - `TWO_SECOND_CONTINUOUS_VIDEO_VIEWS` → `video_view`
  - `APP_INSTALLS` → `mobile_app_install` (+ `omni_app_install` fallback)
  - `CONVERSATIONS` → `onsite_conversion.messaging_conversation_started_7d`
  - `REPLIES` → `onsite_conversion.total_messaging_connection`
  - `QUALITY_LEAD` → `onsite_conversion.lead_grouped`
- `results = actions[chosenType]` — no more `Math.max(...)`.
- `cost_per_result = cost_per_action_type[chosenType]` (fall back to `spend/results`).
- Persist `chosen_result_type` on the row so the UI can label the column (e.g. "Purchases", "Leads", "Messages").

**Attribution window:** always request with `action_attribution_windows=['7d_click','1d_view']` unless the account default is different (auto-detect from `/act_XXX?fields=default_action_attribution_windows`) — this is the single biggest source of "our number ≠ Ads Manager".

### 2. TikTok

**Fetch new data:**
- `GET /adgroup/get/?fields=[..,optimization_goal,optimization_event,promoted_object,secondary_optimization_event,billing_event,campaign_id]` — build `adgroupGoalMap[campaign_id]`.
- Extend `BC_METRICS_A/B` with: `frequency, cost_per_result, real_time_result, real_time_result_rate, result, cost_per_conversion, conversion_rate, real_time_conversion, real_time_conversion_rate, video_play_actions, video_watched_2s, video_watched_6s, average_video_play, total_purchase_value, video_views_p25, p50, p75, p100, average_video_play_per_user`.
  - TikTok already exposes `result` and `cost_per_result` — those are the fields Ads Manager literally shows. Use them directly instead of re-deriving.

**Results derivation:**
- Primary: `results = metrics.result` (TikTok computes this from the ad-group's `optimization_event`, so it matches Ads Manager 1:1).
- Fallback (if `result` is 0 because the account is on a legacy plan): map `optimization_event` → metric:
  - `COMPLETE_PAYMENT` / `SHOPPING` → `complete_payment` (or `total_complete_payment` from BC)
  - `FORM` → `form`
  - `CLICK` → `clicks`
  - `LEAD_GENERATION` → `onsite_form`
  - `MESSAGE` / `IN_APP_MESSAGE` → `message`
  - `INITIATE_CHECKOUT` → `initiate_checkout`
  - `VIEW_CONTENT` → `view_content`
  - `INSTALL` → `real_time_app_install`
  - `VIDEO_VIEW` → `video_watched_6s`
- Persist chosen result label same as Meta.

**Fix known bug:** current code sets `tiktokLeadsDm = tiktokConvDm > 0 ? conversions : 0` — this is a hack. Remove it; use the mapped `result` value.

### 3. Google Ads

**Fetch new data:**
Extend the GAQL query to what Ads Manager shows by default:
```
SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type,
       campaign.advertising_channel_sub_type, campaign.bidding_strategy_type,
       segments.date, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.ctr,
       metrics.average_cpc, metrics.average_cpm, metrics.conversions, metrics.conversions_value,
       metrics.all_conversions, metrics.all_conversions_value, metrics.cost_per_conversion,
       metrics.cost_per_all_conversions, metrics.view_through_conversions,
       metrics.video_views, metrics.video_view_rate, metrics.engagements, metrics.interactions,
       metrics.absolute_top_impression_percentage, metrics.top_impression_percentage,
       metrics.search_impression_share
FROM campaign WHERE segments.date BETWEEN … 
```

**Results derivation by `advertising_channel_type`:**
- `SEARCH` / `SHOPPING` / `PERFORMANCE_MAX` → `conversions`
- `DISPLAY` → `conversions` (fallback `all_conversions`)
- `VIDEO` → `video_views` (unless conversion campaign → `conversions`)
- `DISCOVERY` / `DEMAND_GEN` → `conversions`
- Unknown → `conversions`

### 4. Schema additions (`daily_metrics` + `campaign_performance`)

Migration adds columns (all nullable, default 0):
- `frequency numeric`, `cost_per_result numeric`, `result_type text` (e.g. `purchase`, `lead`, `message`, `link_click`, `video_view`), `video_views numeric`, `video_p25 numeric`, `video_p50 numeric`, `video_p75 numeric`, `video_p100 numeric`, `all_conversions numeric`, `all_conversions_value numeric`, `view_through_conversions numeric`, `engagement_rate numeric`, `unique_clicks numeric`.

Grants + realtime unchanged; single migration file, one call.

### 5. UI parity (frontend)

- `DeepDiveTable` / `CampaignAnalyticsPanel` "Results" column label becomes dynamic per row: `results (result_type)` — e.g. "12 Purchases", "48 Messages", matching what Ads Manager shows.
- New optional preset columns: Frequency, Cost per Result, Video Views, ThruPlays, All Conversions (Google), View-Through Conv (Google).
- Aggregation (multi-campaign totals) sums `results` only across rows sharing the same `result_type`; mixed views show a breakdown tooltip instead of a single misleading number.
- No extra derived KPIs on top of what platforms display.

### 6. Verification

For 3 sample accounts per platform, add a one-off `debug-metric-parity` edge function that:
1. Reads yesterday's row from each ad platform via their API.
2. Reads our `daily_metrics` row.
3. Logs field-by-field diff with tolerance ±0.5%.
Run once after deploy; iterate mapping until diff = 0 on Results, Spend, Impressions, Clicks, CTR, CPC, CPM, Reach, Frequency, Cost/Result, Conversions.

## Files touched
- `supabase/functions/sync-deep-dive/index.ts` — Meta/TikTok/Google metric fetch + result mapping rewrite.
- `supabase/functions/sync-fast-lane/index.ts` — mirror the Meta+Google result mapping (fast lane already reuses same helpers).
- new migration — add columns above.
- `src/components/client-analytics/DeepDiveTable.tsx` + `CampaignAnalyticsPanel.tsx` — dynamic result label + new columns.
- new `supabase/functions/debug-metric-parity/index.ts` — verification only, deleted after sign-off.

## What is intentionally NOT changed
- Sync scheduling, orchestrator, queue worker, guard system, currency conversion, RLS, wallet debits — untouched.
- No new user-visible tabs; only column accuracy + labels.

## Question
Should I also apply the same Results-mapping upgrade to the **ad-set** (`daily_metrics_adset`) and **ad** (`daily_metrics_ad`) levels in the same pass? It doubles the surface area but is the only way to make those two drill-down tables also match Ads Manager. Default: **yes** for full parity.
