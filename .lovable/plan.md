

# Fix: Sync Overwrites Paused Campaign Status Back to "Active"

## Root Cause

When a client pauses a campaign via the `pause-campaign` edge function, the campaign status is correctly set to `"paused"` in the DB and on the ad platform. However, when `sync-deep-dive` runs a few minutes later, it **overwrites the status back to "active"** due to two fallback bugs:

1. **Status map failure fallback** (lines 245-247, 470-472): If the platform status API call fails (network error, rate limit, etc.), `metaStatusMap`/`tiktokStatusMap` stays empty. Then on line 303/496:
   ```js
   const metaCampaignStatus = metaStatusMap[rawCampaignId] || "active";  // defaults to "active"!
   ```
   This blindly resets every campaign to "active" in the DB.

2. **Pagination gap**: The status fetch uses `limit=500` with no pagination. If there are 500+ campaigns, some won't be in the map and will default to `"active"`.

3. **Same issue exists for Google** (line 385): `statusMap[row.campaign?.status] || "active"` — if status field is missing, defaults to "active".

## Fix (in `sync-deep-dive/index.ts`)

### Change 1: `upsertCampaign` — preserve existing status when unknown
When the incoming status is `"active"` (the fallback default) and the campaign already exists in the DB with a non-active status like `"paused"`, **keep the existing DB status** instead of overwriting. Only overwrite if we have a confirmed real status from the platform API.

Modify `upsertCampaign` to accept a `statusConfirmed: boolean` flag. When `false`, skip the status update on existing campaigns.

### Change 2: Track confirmed vs fallback statuses
- For **Meta**: Only mark status as confirmed if `metaStatusMap` has an explicit entry for that campaign ID (not the `|| "active"` fallback).
- For **Google**: Same — only confirmed if `row.campaign?.status` is present.
- For **TikTok**: Same — only confirmed if `tiktokStatusMap` has an explicit entry.

### Change 3: Add pagination to Meta status fetch
Add `after` cursor pagination to the Meta campaigns status fetch to handle accounts with 500+ campaigns.

### Files Changed

| File | Change |
|------|--------|
| `supabase/functions/sync-deep-dive/index.ts` | Add `statusConfirmed` parameter to `upsertCampaign`; preserve existing DB status when platform status is unknown; add pagination to Meta status fetch |

