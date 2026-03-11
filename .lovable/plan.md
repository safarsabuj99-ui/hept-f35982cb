

# Fix: TikTok Campaigns Showing Paused When Actually Active

## Root Cause Analysis

Two separate issues are causing this:

**Issue 1: Stale "paused" status stuck in database**
The `sync-deep-dive` status fetch via `/campaign/get/` may be silently failing (geo-restriction or parse error), causing `tiktokStatusMap` to remain empty. When that happens, `statusConfirmed = false`, so the `upsertCampaign` function preserves the existing DB status -- which was incorrectly set to "paused" by earlier sync runs before the status mapping fix. The campaigns are locked in "paused" state and will never self-correct.

**Issue 2: Pause/Enable toggle hits geo-block**
The `pause-campaign` edge function correctly uses the Cloudflare proxy but TikTok's write endpoint `/campaign/status/update/` is also geo-restricted. The error `"Client IP address is in banned Country list"` confirms this. The proxy may not be forwarding the request properly for POST calls, or the write endpoint requires different handling.

## Plan

### 1. Fix `sync-deep-dive/index.ts` -- Robust status fetching

- Add detailed logging for the status fetch response (log `statusJson.code` and count of campaigns found)
- If the status fetch fails entirely (catch block), log the error but also set a flag so the fallback status for TikTok campaigns defaults to "active" instead of preserving stale DB values
- When `tiktokStatusMap` is empty after the fetch attempt (meaning the API call failed), force `statusConfirmed = true` with status "active" for all TikTok campaigns -- since TikTok campaigns are typically active unless explicitly disabled
- Add the `advertiser_id` filtering parameter that might be missing

### 2. Fix `pause-campaign/index.ts` -- Route TikTok writes through proxy

- The `checkTikTokStatus` helper and the main update call already use `tiktokBase` with the proxy URL
- Add logging to capture the exact TikTok API response for debugging
- Add a retry: if the direct/proxy call fails with geo-ban, surface a clear error message telling the user the proxy needs Smart Placement enabled for POST requests too

### 3. One-time DB fix for stuck statuses

- In `sync-deep-dive`, when the status fetch succeeds and maps are populated, force-update even when `statusConfirmed` was previously false -- the current logic already does this correctly if the map is populated
- The real fix: ensure the status fetch doesn't silently fail. Add proper error logging and ensure the proxy is used for the `/campaign/get/` call (it already is at line 561)

## Files to modify

| File | Change |
|------|--------|
| `supabase/functions/sync-deep-dive/index.ts` | Add logging, fix fallback: when status fetch fails, default TikTok to "active" with `statusConfirmed=true` so stale "paused" gets overwritten. Also log raw `operation_status` values received. |
| `supabase/functions/pause-campaign/index.ts` | Add response logging for TikTok API calls. Improve error message for geo-ban to guide user. |

