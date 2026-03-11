

# Fix TikTok Toggle Button & Delivery Status

## Problems Found

1. **Bug in `sync-deep-dive`**: Line 627 references undefined variable `statusText` — this throws a runtime error during TikTok status fetching, which gets caught by the try/catch and marks status fetch as failed. While the fallback defaults campaigns to "active", the error noise masks real issues.

2. **Toggle button missing**: The toggle only appears for campaigns with status `active` or `paused`. After clearing data and re-syncing, if the sync fails due to 41000 geo-restriction (even with retry), no campaigns exist in the DB, so nothing renders. The toggle logic itself is correct.

3. **TikTok on/off works the same as Meta**: The `pause-campaign` edge function already handles TikTok with local-only fallback for geo-blocked scenarios. No changes needed there.

## Fix

### File: `supabase/functions/sync-deep-dive/index.ts`
**Line 627** — Fix the undefined `statusText` variable:
```
// Before (BUG):
console.warn(`TikTok status fetch failed with code ${statusJson.code}: ${statusJson.message || statusText.substring(0, 200)}`);

// After (FIX):
console.warn(`TikTok status fetch failed with code ${statusJson.code}: ${statusJson.message || 'unknown error'}`);
```

This is a one-line fix. The undefined `statusText` reference causes an exception that silently breaks the TikTok status fetch, preventing proper status mapping. Once fixed:
- TikTok campaigns will correctly show "active", "paused", "active - ad groups paused", etc. in the Delivery column
- The toggle switch will appear for all campaigns with "active" or "paused" status
- On/off toggling will work identically to Meta (already implemented with local-only fallback)

