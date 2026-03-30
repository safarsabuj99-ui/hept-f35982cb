

# Fix: Campaign Requests Not Showing on Client Side

## Root Cause

`NewCampaignRequest.tsx` inserts with `client_id: user.id` (the logged-in user's auth ID), but does **not** use `useImpersonation()`. When an admin impersonates a client and submits, the record is saved with the **admin's** ID. The client's campaign list (`MyCampaignRequests`) queries by `effectiveClientId` (the **client's** ID), so the records never match.

Even for real clients, using `effectiveClientId` is the correct pattern for consistency across the app.

## Fix — `src/pages/NewCampaignRequest.tsx`

1. Import and use `useImpersonation()` to get `effectiveClientId`
2. Change the insert from `client_id: user.id` → `client_id: effectiveClientId`
3. After successful submission, navigate to `/dashboard/campaigns` instead of `/dashboard` so the user immediately sees their new requests

## Files Modified

1. **`src/pages/NewCampaignRequest.tsx`** — 3 small changes (add hook, fix client_id, fix redirect)

