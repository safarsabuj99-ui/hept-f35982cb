

## Bug Analysis: Meta Campaign Pause Not Working

### Root Cause Found

In `supabase/functions/pause-campaign/index.ts`, line 215:

```typescript
if (json.success || res.ok) {
  apiSuccess = true;
}
```

**The bug**: `res.ok` checks HTTP status 200-299. Meta Graph API can return HTTP 200 with error details in the JSON body (e.g., permission errors, rate limits, invalid token). Because of the `||` operator, `res.ok` being `true` short-circuits the check — the function reports success and updates the local DB to "paused" even though Meta never actually paused the campaign.

Additionally, there is **zero logging** for Meta API calls (contrast with TikTok which has `console.log` statements), making this bug invisible in production.

### Fix Plan

**File**: `supabase/functions/pause-campaign/index.ts`

#### Fix 1 — Correct the success check
Replace `json.success || res.ok` with `json.success === true`. This ensures only an explicit `{"success": true}` from Meta is treated as a real success.

#### Fix 2 — Add post-pause verification read-back
After a successful Meta pause API call, immediately call `checkMetaStatus()` to verify the campaign actually changed state on Meta's side. Only mark `apiSuccess = true` if the read-back confirms the new status. This mirrors the verification pattern already used by the Ad Guard system.

#### Fix 3 — Add diagnostic logging
Add `console.log` statements for Meta API calls (request URL, response status, response body) matching the existing TikTok logging pattern. This ensures future issues are debuggable from edge function logs.

#### Fix 4 — Move access_token to request body
Move `access_token` from the URL query string into the POST body alongside `status`. This follows Meta's recommended practice and avoids potential token leakage in server logs.

### Files Changed (1 file)

| File | Change |
|------|--------|
| `supabase/functions/pause-campaign/index.ts` | Fix success check, add verification read-back, add logging, move token to body |

