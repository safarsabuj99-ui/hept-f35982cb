

# Diagnosis: TikTok Proxy Partially Working + Date Range Issue

## What the Logs Reveal

Looking at the actual edge function logs, there are **two separate problems**:

| Function | Error | Meaning |
|----------|-------|---------|
| `sync-ad-spend` | **40002** - "max time span is 30 days" | Proxy IS working (got past geo-block), but date range too long |
| `sync-fast-lane` | **41000** - "banned Country list" | Proxy may not have been redeployed yet |
| `sync-deep-dive` | **41000** - "banned Country list" | Same - old code may still be running |

The `sync-ad-spend` function successfully bypassed the geo-restriction (error 40002 is a date range error, not a geo error), proving the Cloudflare Worker proxy works. But `sync-fast-lane` and `sync-deep-dive` still get 41000, likely because they hadn't finished redeploying when you triggered the sync.

## Plan

### 1. Force redeploy all TikTok edge functions
Add a small comment change to `sync-fast-lane` and `sync-deep-dive` to trigger a fresh deployment, ensuring they use the proxy code.

### 2. Fix 30-day date range limit for TikTok
The TikTok API rejects `stat_time_day` requests spanning more than 30 days. `sync-ad-spend` tries to sync from `2025-11-01` to `2026-03-11` (130+ days). Fix: chunk requests into 30-day windows and merge results.

### 3. Add diagnostic logging
Add a log line that prints the exact URL being fetched for TikTok BC-scoped calls so we can confirm the proxy URL is in use.

## Files to Change
- `supabase/functions/sync-ad-spend/index.ts` - Add 30-day chunking for TikTok date ranges
- `supabase/functions/sync-fast-lane/index.ts` - Add deploy-trigger comment + diagnostic log
- `supabase/functions/sync-deep-dive/index.ts` - Add deploy-trigger comment + diagnostic log

