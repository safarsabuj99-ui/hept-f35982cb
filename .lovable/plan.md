

# Fix: TikTok Campaign Toggle Failing Due to Geo-Restriction

## Problem
The TikTok API returns error 41000 ("Client IP address is in banned Country list") for both read and write requests through the Cloudflare proxy. This means the `pause-campaign` edge function cannot call TikTok's `/campaign/status/update/` endpoint, causing a 502 error every time the toggle is clicked.

The proxy at `hept.raohas10.workers.dev` is being geo-blocked by TikTok even for POST requests. Smart Placement on the Cloudflare Worker is either not enabled or not routing to an allowed region.

## Solution

Since the proxy is geo-blocked for TikTok write operations, the fix is to **gracefully handle the geo-block by updating the local DB status** and informing the user that the platform-side change could not be made. This is a practical approach because:

1. The user knows their campaign's actual state on TikTok
2. The local status controls what the UI shows
3. The sync function will eventually reconcile if the proxy starts working

### Changes to `supabase/functions/pause-campaign/index.ts`

When TikTok returns error 41000 (geo-blocked) and we cannot verify the current status either (because GET is also geo-blocked), instead of returning a 502 error:

- Update the local DB campaign status to the desired state
- Return a **success response with a warning** that the change was applied locally only
- Log it in audit_logs with a clear note that platform-side change was not confirmed

This replaces the current behavior (lines 259-267) where a geo-block with no status confirmation throws a hard error.

### Specific code change

In the TikTok geo-block handler (around line 259-267), when `checkTikTokStatus` also returns null (because GET is also geo-blocked):
- Instead of setting `apiMessage` and failing, set `apiSuccess = true` and `apiMessage` to a warning
- Add a `localOnly` flag so the audit log and response message clarify this was a local-only update

This single change in `pause-campaign/index.ts` resolves the toggle failure for TikTok campaigns while keeping the existing logic for Meta and Google untouched.

