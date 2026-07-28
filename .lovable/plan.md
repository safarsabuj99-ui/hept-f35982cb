## Problem

The client UI already supports both directions: `ClientReports.tsx` reads `profiles.client_permissions` and passes `canPause` / `canResume` into the campaign table, and `ClientDetail.tsx` lets the agency toggle those flags.

The block is server-side. In `supabase/functions/pause-campaign/index.ts`, before any ownership check:

```
if (isEnableAction && !isAdmin) → 403 "Only admins can enable campaigns"
```

So a client with resume permission can pause (allowed path) but every enable request is rejected outright.

## Fix

In `pause-campaign`, replace the blanket admin-only rule for `action = "enable"` with a permission-aware check:

1. When the caller is not an admin/platform_owner, load their `profiles.client_permissions`.
2. Resolve effective flags, matching the frontend logic exactly:
   - pause allowed if `can_pause_campaigns === true` or legacy `can_toggle_campaigns === true`
   - resume allowed if `can_resume_campaigns === true` or legacy `can_toggle_campaigns === true`
3. Reject with a clear message only when the specific flag for the requested action is missing ("Your agency has not enabled campaign resume access").
4. Keep the existing `ad_account_clients` ownership check for clients — the client must still own the ad account tied to the campaign.
5. Keep guard-paused campaigns admin-only: if the campaign status is `guard_paused`, a client resume stays blocked (balance protection), with a message telling them to add funds. This mirrors the frontend, which already only offers resume for plain `paused` / `disable`.

Everything after the permission gate (platform API call, verification, local status update, audit log) is unchanged, so Meta / TikTok / Google enable behaviour and error hints stay the same.

## Verification

- Confirm a client with resume permission can enable a plain paused campaign owned by their ad account.
- Confirm a client without the flag still gets a 403 with the clearer message.
- Confirm a guard-paused campaign still cannot be resumed from the client side.

## Technical notes

Single file changed: `supabase/functions/pause-campaign/index.ts`. No schema or migration needed — `client_permissions` already exists on `profiles` and is the same source the client UI reads.
