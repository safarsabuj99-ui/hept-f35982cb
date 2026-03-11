
# Fix TikTok Campaign Status Detection & Add Pause/Enable Toggle

## Problem

1. **All TikTok campaigns show as "Paused"** — The sync logic (lines 566-572 of `sync-deep-dive`) checks `operation_status` but TikTok's `/campaign/get/` returns campaign-level `operation_status`. The current logic only maps `CAMPAIGN_STATUS_ENABLE` and `CAMPAIGN_STATUS_ADVERTISER_BUDGET_FULL` to "active" — but if the campaign is active while ad groups under it are paused, TikTok may return a different status like `CAMPAIGN_STATUS_ALL_ADGROUP_PAUSED` which currently falls through to "paused".

2. **No on/off toggle for TikTok** — The pause button exists in `DeepDiveTable` but only shows for `status === "active"` campaigns. Since TikTok campaigns are incorrectly marked "paused", the button never appears. Also, there's no "enable" (resume) functionality — only pause.

3. **Ad group level delivery** — The user wants the delivery column to reflect what's actually happening at the ad group level (e.g., if ad groups are on/off, that should show in delivery).

## Plan

### 1. Fix TikTok status mapping in `sync-deep-dive`

Update lines 566-572 to properly map TikTok's `operation_status` values:
- `CAMPAIGN_STATUS_ENABLE` → "active"
- `CAMPAIGN_STATUS_ADVERTISER_BUDGET_FULL` → "active" 
- `CAMPAIGN_STATUS_ALL_ADGROUP_PAUSED` → "active" (campaign itself is on, ad groups are paused)
- `CAMPAIGN_STATUS_DISABLE` → "paused"
- `CAMPAIGN_STATUS_DELETE` → "deleted"
- Also use `secondary_status` to enrich the delivery label (e.g., "active - ad groups paused")

Additionally, fetch ad group statuses via TikTok's `/adgroup/get/` endpoint to determine actual delivery status per campaign. Store a more granular delivery status.

### 2. Add enable (resume) functionality to `pause-campaign` edge function

Currently the function only pauses. Update it to accept an `action` parameter (`pause` or `enable`):
- For TikTok enable: call `/campaign/status/update/` with `opt_status: "ENABLE"`
- For Meta enable: POST with `status: "ACTIVE"` 
- For Google enable: mutate with `status: "ENABLED"`
- Update local DB status to "active" on enable

### 3. Update `DeepDiveTable` toggle UI

Replace the pause-only button with a toggle switch (like Meta) for all platforms:
- Active campaigns show an "on" toggle → clicking it pauses
- Paused campaigns show an "off" toggle → clicking it enables
- Add confirmation dialog for both actions

### 4. Trigger a re-sync after deployment

Once deployed, trigger `sync-deep-dive` to re-fetch correct TikTok statuses.

## Files to modify:
- `supabase/functions/sync-deep-dive/index.ts` — Fix TikTok status mapping
- `supabase/functions/pause-campaign/index.ts` — Add enable/resume support
- `src/components/client-analytics/DeepDiveTable.tsx` — Add on/off toggle for all platforms
