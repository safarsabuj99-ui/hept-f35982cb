# Fix: Ad Guard re-triggering on long-dead campaigns

## What actually happened (verified)

At 21:31–21:32 UTC today Ad Guard queued and paused large batches of campaigns for Akram Ahmed (30), Mostofa, Novella, Nafsin, Sultan, Ramim and others, sending an "urgent" notification for each.

Checking those exact campaigns in the database:

- `Akram/Our/...` campaigns last recorded spend in **March–May 2026** — they have been off for months.
- Their current status is `disable`, and Ad Guard stamped `pause_requested_at = 21:32` today and confirmed the pause via the TikTok API a minute later.

So Ad Guard did not act on live campaigns. It acted on dead campaigns whose stored status had been flipped back to `active` shortly before.

## Root cause

In the TikTok branch of the deep-dive sync, the campaign status is resolved with:

```
const tiktokCampaignStatus = tiktokStatusMap[rawCampaignId] || "active";
const tiktokStatusConfirmed = true;   // hardcoded
```

Two defects:

1. When a campaign is **not present** in the status list response (the status endpoint returned 89 campaigns while the metric chunks covered far more, including old ones from March), the code silently falls back to `"active"`.
2. `statusConfirmed` is hardcoded `true`, so the "don't touch status when unconfirmed" protection in `upsertCampaign` never applies — and the existing `tiktokStatusFetchFailed` flag is computed but never used.

The recent 5-month TikTok backfill therefore replayed metrics for hundreds of long-dead campaigns and rewrote each of them to `active`. Ad Guard's Phase 2 scans exactly `status in (active, enable, Active)`, found them all under threshold, and paused + notified for every one of them.

Meta's branch already does this correctly (`statusConfirmed = rawCampaignId in metaStatusMap`); TikTok and Google do not.

## The fix

### 1. Never invent an "active" status (primary fix)

In `supabase/functions/sync-deep-dive/index.ts`:

- TikTok: `statusConfirmed = !tiktokStatusFetchFailed && (rawCampaignId in tiktokStatusMap)`; drop the `|| "active"` fallback and pass the existing DB status through when unconfirmed.
- Google: apply the same membership check instead of an unconditional fallback.
- `upsertCampaign`: when a **new** campaign row is created with an unconfirmed status, insert it as `paused`, not `active`, so an unknown campaign can never trip the guard.
- Same hardening in `sync-fast-lane`'s `refreshCampaignStatuses` (it already only writes statuses it actually received — verify and keep it that way).

### 2. Make Ad Guard require a fresh, platform-confirmed "on" state

Add `status_confirmed_at timestamptz` to `campaigns`, stamped only when the status came directly from a platform API response.

`ad-guard-check` Phase 2 then only pauses a campaign when:
- status is active/enable, **and**
- `status_confirmed_at` is within the last 24 hours.

A stale or synthetic status can no longer cause a pause. Existing rows get backfilled from `updated_at` so behaviour is unchanged for genuinely live campaigns.

### 3. Stop the notification storm

- Skip pausing (and notifying) entirely when the platform reports the campaign is already off — `pause-campaign` already detects this; Ad Guard will treat "already off" as a silent reconcile that updates the DB status without writing an audit "pause" row or firing a notification.
- Collapse Ad Guard notifications to **one per client per run** ("X campaigns paused, low balance") instead of one per client per batch, so a wide sweep can't produce dozens of urgent alerts.

### 4. One-time cleanup

Reconcile the affected campaigns: for campaigns with no spend in the last 30 days that Ad Guard touched today, clear `pause_required` / pause error fields and dismiss the resulting notifications, so the guard queue and the notification list are clean.

## Technical notes

- Files: `supabase/functions/sync-deep-dive/index.ts`, `supabase/functions/sync-fast-lane/index.ts`, `supabase/functions/ad-guard-check/index.ts`, one migration for `campaigns.status_confirmed_at` plus backfill.
- No frontend changes required.
