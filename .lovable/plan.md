## Root cause

Two distinct bugs make SaaS campaign status disagree with the ad platform:

### Bug A — Meta `ADSET_PAUSED` is misread as "paused"
Meta's `effective_status` returns `ADSET_PAUSED` when the **campaign itself is ACTIVE** but every ad set inside it is paused. In `sync-deep-dive` (Meta status fetch) and in `pause-campaign` (`isOffStatus`) we currently treat `ADSET_PAUSED` and `CAMPAIGN_PAUSED` identically as "paused". Result: campaigns the user sees as ON in Ads Manager get displayed as OFF in the SaaS, and admins can't re-enable them (the "already paused" guard blocks the request). TikTok has the correct `"active - ad groups paused"` label already — Meta needs the equivalent.

### Bug B — Status only refreshes on a full deep-dive
- Fast-lane never touches `campaigns.status`, and deep-dive is the only writer.
- Deep-dive is heavy, chunked and rate-limited, so status can be stale for hours after someone toggles a campaign directly on Meta/TikTok/Google.
- Additionally, TikTok's `/campaign/get/` call in `sync-deep-dive` uses `page_size=500` **without pagination**. Accounts with >500 campaigns silently drop the tail — those campaigns come back with `statusConfirmed=false` and keep whatever stale status the DB had.

Together this is why the user sees "off in SaaS, on in Ads Manager" and why "when API call then SaaS not triggered" — nothing in the fast path refreshes status.

## Fix plan

### 1. Correct Meta status mapping (`supabase/functions/sync-deep-dive/index.ts`)
In the Meta status loop (~line 500):
- `CAMPAIGN_PAUSED` → `"paused"` (campaign entity truly paused)
- `PAUSED` → `"paused"`
- `ADSET_PAUSED` → `"active - ad sets paused"` (NEW — campaign is active, only adsets paused)
Mirrors the TikTok convention and `isActiveStatus()` in `src/lib/campaignStatus.ts` already treats `"active - ..."` as active.

### 2. Correct `isOffStatus` in `pause-campaign` (`supabase/functions/pause-campaign/index.ts`)
Remove `ADSET_PAUSED` from the Meta "off" list so:
- The "already paused" pre-check no longer blocks legitimate pause/enable calls on active-with-paused-adsets campaigns.
- Read-back verification doesn't report a real pause as failed.

### 3. Paginate TikTok `/campaign/get/` (`sync-deep-dive`, ~line 1358)
Loop with `page` param until `page_info.total_page` reached, so status/objective/budget maps are complete for accounts with >500 campaigns. Prevents statuses from silently sticking to stale DB values.

### 4. New lightweight status refresher — fast-lane hook
Add a `refreshCampaignStatuses(accountId)` helper that hits ONLY the campaigns-list endpoint (Meta `/campaigns?fields=effective_status`, TikTok `/campaign/get/`, Google `SELECT campaign.status`). No insights, no metrics — cheap enough to call from `sync-fast-lane` every run. It updates `campaigns.status` for that account using the same guard-protection rules deep-dive uses (never overwrites `guard_paused`).

Result: within one fast-lane cycle (~a few minutes) any platform-side toggle propagates to the SaaS, without waiting for a full deep-dive.

### 5. Post-action re-verification in `pause-campaign`
After successful pause/enable, enqueue the lightweight status refresh for that ad account (or call it inline for a single campaign) so the UI reflects platform-confirmed state on the next query cycle even if the write and verify diverge.

### 6. Backfill one-time correction
Run a one-off SQL update to relabel existing Meta campaigns that are currently `status='paused'` but whose latest deep-dive returned `ADSET_PAUSED` (tracked by re-syncing). This is handled automatically by the next deep-dive after the mapping fix, so no explicit migration needed.

## Verification
- Trigger a deep-dive on a Meta account with a known "active but all adsets paused" campaign → confirm status shows `active - ad sets paused` in `DeepDiveTable`.
- Pause a Meta campaign directly in Ads Manager → confirm SaaS reflects it after the next fast-lane run (< a few minutes), not next deep-dive.
- Enable via SaaS a campaign whose effective status is `ADSET_PAUSED` → no longer rejected as "already paused".
- Check `sync-deep-dive` logs for TikTok account with >500 campaigns → pagination log lines present, `statusConfirmed=true` for tail campaigns.

## Files touched
- `supabase/functions/sync-deep-dive/index.ts` — Meta mapping fix, TikTok pagination.
- `supabase/functions/pause-campaign/index.ts` — `isOffStatus` fix, post-action refresh call.
- `supabase/functions/sync-fast-lane/index.ts` — hook the new status-only refresher per synced account.
- (No DB schema change; no frontend change — status labels already render via existing `isActiveStatus` helper.)
