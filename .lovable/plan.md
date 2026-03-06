

# Handle Already-Paused Campaigns on Platform

## Problem
When a campaign is already off/paused on the actual ads platform but the local database still shows it as "active" (due to sync delay or mismatch), clicking the pause button fails with a platform API error. The function should detect this scenario and gracefully update the local status instead of returning an error.

## Plan

### 1. Update pause-campaign edge function
**`supabase/functions/pause-campaign/index.ts`**

For each platform's API response, handle the case where the campaign is **already paused** on the platform:

- **Meta**: If the API call succeeds (campaign set to PAUSED) or returns an error indicating it's already paused/inactive, treat it as success
- **Google**: Same — if status is already PAUSED, the mutate call typically succeeds anyway
- **TikTok**: Same approach

**Key change**: After the platform API call, if it fails, check if the failure reason is because the campaign is already paused/disabled on the platform. If so, treat it as a success and update the local DB status to match.

Additionally, before calling the platform API, **first query the platform to get the current status**. If it's already paused/off, skip the pause call and just update the local DB.

**Simplified approach** (more robust): Wrap the API call so that if pausing fails, we do a **GET request** to check the campaign's actual status on the platform. If it's already paused/off, update local DB and return success with a message like "Campaign was already off on the platform — local status updated."

| File | Change |
|------|--------|
| `supabase/functions/pause-campaign/index.ts` | After a failed pause API call, check actual platform status; if already off, update local DB and return success |

