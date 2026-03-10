

# Fix: Route ALL TikTok API Calls Through Proxy

## Problem
Your Cloudflare Worker proxy (`https://hept.raohas10.workers.dev/`) is set up correctly, but the edge functions still use the hardcoded `https://business-api.tiktok.com` URL for the **BC-scoped** TikTok calls. The proxy (`tiktokBase`) is only used in the fallback path. Since both BC-scoped and fallback calls originate from the same blocked Singapore IP, both fail with error 41000.

## Root Cause
In 3 sync edge functions, the BC-scoped TikTok report call hardcodes the direct URL instead of using `tiktokBase`:
```
// Current (broken) - line 328 in sync-fast-lane
fetch(`https://business-api.tiktok.com/open_api/v1.3/report/integrated/get/?...`)

// Should be
fetch(`${tiktokBase}/open_api/v1.3/report/integrated/get/?...`)
```

## Files to Update

| File | Change |
|------|--------|
| `supabase/functions/sync-fast-lane/index.ts` | Line 328: replace hardcoded URL with `${tiktokBase}` |
| `supabase/functions/sync-ad-spend/index.ts` | Line ~384: same fix |
| `supabase/functions/sync-deep-dive/index.ts` | Lines ~479, ~537: same fix for BC report + campaign/get calls |
| `supabase/functions/auto-import-accounts/index.ts` | Lines ~114, ~153, ~185: route BC asset/advertiser/balance calls through proxy |
| `supabase/functions/sync-billing-data/index.ts` | Line ~100: route advertiser/info call through proxy |
| `supabase/functions/test-connection/index.ts` | Line ~76: route test connection call through proxy |
| `supabase/functions/pause-campaign/index.ts` | Lines ~44, ~210: route campaign get/update calls through proxy |

For functions that don't already read the `tiktok_proxy_url` setting (auto-import, sync-billing, test-connection, pause-campaign), add the settings lookup and `getTikTokBaseUrl` helper.

## Summary
Every `fetch("https://business-api.tiktok.com/...")` in edge functions must be replaced with `fetch("${tiktokBase}/...")` so all TikTok traffic routes through your Cloudflare Worker proxy. No database changes needed -- only edge function code updates.

