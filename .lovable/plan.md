

# Optimize sync-deep-dive for Platform-Specific Syncs

## Problem
The `sync-deep-dive` function processes all platforms (Meta, Google, TikTok) sequentially in a single invocation. With multiple accounts and months of historical data, it regularly times out (edge functions have a ~60s limit). There's no way to sync just one platform.

## Solution
Add an optional `platform` query parameter to filter which accounts get synced. The frontend Settings page will pass this parameter when triggering individual syncs, and "Sync All" will omit it to sync everything.

## Changes

### 1. Edge Function: `supabase/functions/sync-deep-dive/index.ts`
- Parse an optional `platform` param from the request body (e.g. `{ "platform": "tiktok" }`)
- When provided, filter the `accounts` query to only include `platform_name = platform`
- No other logic changes — the rest of the function works as-is

Key code change (after line 50, inside the try block):
```typescript
let body: any = {};
try { body = await req.json(); } catch {}
const platformFilter: string | null = body?.platform || null;
```

Then at line 82, add `.eq("platform_name", platformFilter)` conditionally when `platformFilter` is set.

### 2. Frontend: `src/pages/Settings.tsx`
- Update the sync invocation to pass `{ platform: "tiktok" }` / `{ platform: "meta" }` etc. when a specific sync is triggered
- No change needed if Settings already calls each function individually (it does — each sync button triggers a different edge function, not platform-filtered deep-dive)

Actually, since the Settings page already has separate buttons for different *functions* (fast-lane, deep-dive, ad-spend, billing), the platform filter is most useful for programmatic/retry calls. The simplest high-value change is just adding the optional filter to the edge function so it can be called with `{ "platform": "tiktok" }` to avoid timeouts.

### Summary of File Changes
| File | Change |
|------|--------|
| `supabase/functions/sync-deep-dive/index.ts` | Accept optional `platform` body param; filter accounts query when provided |

This is a minimal, backward-compatible change — calling without the param works exactly as before.

