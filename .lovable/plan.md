

## Fix Ad Guard: Campaigns Not Pausing on TikTok Platform

### Root Cause (Confirmed by Testing)

I tested the system end-to-end and found the exact bug:

1. **`pause-campaign` works perfectly** — I called it directly for one of Arafat's guard_paused campaigns and TikTok returned `code: 0` (success). The campaign was paused on TikTok within 4 seconds.

2. **`ad-guard-check` times out** — When I called it, it returned `context canceled` (timeout). Edge functions have a ~25 second limit. The function calls `pause-campaign` **sequentially** for every campaign, and each call takes ~4 seconds (network round-trip to TikTok proxy). With 5+ guard_paused campaigns plus scanning all clients in Phase 2, it exceeds the timeout before finishing. The function boots every 5 minutes (confirmed by logs) but silently dies without completing.

3. **Result**: DB trigger correctly sets campaigns to `guard_paused`, but the cron function never finishes calling the platform APIs, so campaigns remain `guard_paused` in DB and **running on TikTok**.

### Fix

**Rewrite `ad-guard-check` to call platform APIs directly** instead of going through `pause-campaign` (eliminates function-to-function overhead), and **process campaigns in parallel batches** to fit within the timeout.

#### Changes to `supabase/functions/ad-guard-check/index.ts`:

1. **Add inline platform API call logic** — Extract the TikTok/Meta/Google pause logic directly into ad-guard-check. Instead of making a full HTTP request to `pause-campaign` (which itself boots, authenticates, reads DB, calls API), just call the TikTok API directly. This cuts each campaign from ~4s to ~2s.

2. **Parallel processing** — Process guard_paused campaigns in parallel batches of 3 (using `Promise.allSettled`), not one-by-one.

3. **Phase 2 optimization** — Only process clients who have active campaigns (join query instead of looping all clients). Skip the manual balance fallback since `get_client_balance_v2` RPC exists.

4. **Timeout guard** — Track elapsed time and stop processing if approaching the 25s limit, returning partial results.

5. **On success, update campaign status to `paused`** directly (currently only `pause-campaign` does this).

6. **On failure, increment a `retry_count`** and after 3 failures, apply local-only pause status to prevent infinite retry loops.

### Key Logic (Simplified)

```text
Phase 1: guard_paused campaigns
  ├── Group by platform + ad_account (share API tokens)
  ├── Fetch API credentials once per group
  ├── Call platform API directly (TikTok via proxy, Meta via Graph API)
  │   ├── Success → update status to "paused"
  │   └── Fail 3x → update status to "paused" + audit log "local-only"
  └── Process in parallel batches of 3

Phase 2: scan clients (only those with active campaigns)
  ├── Single query: clients with balance ≤ threshold AND active campaigns
  └── Set guard_paused + queue for next Phase 1 run
```

### Files Changed
- **`supabase/functions/ad-guard-check/index.ts`** — Major rewrite: inline API calls, parallel processing, timeout guard

