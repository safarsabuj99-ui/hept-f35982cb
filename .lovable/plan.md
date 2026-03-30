
Plan: Bulletproof Ad Guard fix for “UI says paused, TikTok still active”

What is actually wrong
- I checked the real code and data path, and the failure is not the threshold math anymore.
- Your app is marking campaigns as `guard_paused` in the database, so the UI shows “Paused”.
- But the real TikTok pause depends on a fragile fire-and-forget trigger (`instant_guard_pause`) that tries to call `pause-campaign` from Postgres.
- That path is not reliable enough, and there is no real scheduled retry safety net in the database right now for `ad-guard-check`.
- Result: local state changes, but platform state can stay active. That is exactly what your screenshots show.

Evidence from your project
- For Akram Ahmed, the database currently has 3 TikTok campaigns still in `guard_paused`.
- Those same 3 are the ones still active in TikTok.
- Audit logs show local “Auto-paused … campaigns” events.
- But I found no recent `pause-campaign` execution logs, and no cron schedule for `ad-guard-check`.
- So the app is successfully flagging the campaigns, but not reliably dispatching/retrying the real platform pause.

Why previous fixes did not fully solve it
- The previous fixes mostly improved:
  - threshold calculation
  - status preservation during sync
  - manual guard scans
- But they did not replace the weak part: the automatic platform pause is still edge-triggered, non-idempotent, and easy to miss.
- In other words: the system detects the problem, but the enforcement path is still brittle.

What I will change
1. Replace “pause immediately from DB trigger” with a durable queue/state model
- Add campaign-level pause state fields, for example:
  - `pause_required`
  - `pause_requested_at`
  - `pause_attempted_at`
  - `pause_confirmed_at`
  - `pause_error`
  - `pause_attempt_count`
- Add a `guard_pause_jobs` table for queued/retryable pause work.
- Use unique open-job rules so repeated debits cannot create duplicate chaos.

2. Make the debit trigger idempotent
- Update `auto_pause_on_debit()` so it does not depend on hitting the exact threshold moment.
- When balance is below the effective threshold:
  - mark matching active campaigns as `guard_paused`
  - set `pause_required = true`
  - insert queue jobs with `ON CONFLICT DO NOTHING`
- This means even if the first API call fails, the system still knows those campaigns must be paused.

3. Make `ad-guard-check` the real worker
- Rework `supabase/functions/ad-guard-check/index.ts` to process queued/pending campaigns first.
- It will retry all campaigns where:
  - `pause_required = true`
  - and `pause_confirmed_at is null`
- Only after confirmed platform success should it move the campaign from “pending pause” to fully confirmed paused state.

4. Add a real scheduled retry job
- Create a cron schedule for `ad-guard-check` every few minutes.
- Right now I found cron jobs for sync functions, but not for `ad-guard-check`.
- This is a major missing piece.
- With the schedule in place, even if TikTok fails once, the worker retries automatically.

5. Stop the UI from lying
- Update the Ad Guard UI so it distinguishes:
  - `Pending platform pause`
  - `Paused on platform`
  - `Pause failed / retrying`
- Right now `guard_paused` is effectively shown as “Paused”, which is misleading when the external API has not succeeded yet.
- This is why you see “Paused” in the app while TikTok still shows active.

6. Improve observability
- Add clear audit/error logging for:
  - job queued
  - pause attempt started
  - platform response
  - confirmed paused
  - failed with reason
- Add last error / retry count to the paused campaign list for admins.
- This will make future failures diagnosable in minutes, not by guessing.

Files / areas to update
- `supabase/migrations/...`
  - new durable pause queue/state columns
  - new `guard_pause_jobs` table
  - revised `auto_pause_on_debit()`
  - revised `check_auto_resume()`
  - cron schedule for `ad-guard-check`
  - remove or downgrade the current fragile `instant_guard_pause` HTTP trigger
- `supabase/functions/ad-guard-check/index.ts`
  - convert from “best-effort scanner” to authoritative retry worker
- `supabase/functions/pause-campaign/index.ts`
  - keep for manual actions, but align status confirmation and shared pause logic
- `src/components/AutomationConfigTab.tsx`
  - show pending/confirmed/error state accurately
- any paused campaign UI/table component used in client detail
  - surface confirmation state and retry status

Technical design note
- I will apply the advisor’s state-machine idea, but at the campaign level instead of only ad-account level, because your system pauses client-linked campaigns across ad accounts/platforms.
- The key rule will be:
  - detection sets `pause_required = true`
  - worker keeps retrying until `pause_confirmed_at` is set
  - UI never claims “paused on platform” before confirmation

Validation after implementation
- Reproduce with a client balance crossing below threshold
- Confirm DB changes to `guard_paused + pause_required`
- Confirm queued job creation
- Confirm worker retries automatically without clicking “Run Ad Guard Now”
- Confirm TikTok campaign status changes to disabled
- Confirm UI changes from “Pending platform pause” to “Paused on platform”
- Confirm no duplicate job spam and no misleading status

Expected outcome
- Even if the first TikTok API call is missed, blocked, or delayed, the campaign will still be paused on a later retry automatically.
- The system becomes deterministic instead of “hope the trigger fired”.
- And if TikTok ever refuses the pause, the UI will show that truthfully instead of showing a false paused state.
