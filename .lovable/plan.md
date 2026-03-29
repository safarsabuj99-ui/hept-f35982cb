
Goal: make Ad Guard truly instant and reliable so when client balance reaches threshold (0/negative or configured value), all active campaigns are paused on the ad platform immediately, and UI/state stay consistent everywhere.

What I found (root causes)
1) Guard status is being overwritten later:
- Campaigns are set to `guard_paused`, but sync jobs can write platform status (`enable/active`) back into `campaigns`, so Spend/Accounts show active again.

2) Fallback engine is not healthy:
- Scheduled Ad Guard calls are returning `401` in backend HTTP response logs, so the 5‑minute safety net is not reliably enforcing platform pause.

3) Current guard flow intentionally delays some pauses:
- In `ad-guard-check`, Phase 2 marks campaigns `guard_paused` and logs “Will pause on next cycle” instead of pausing newly-flagged campaigns immediately.

Implementation plan
1) Harden internal function auth path (so backend-to-backend calls always work)
- File: `supabase/config.toml`
- Add explicit function config blocks:
  - `[functions.ad-guard-check] verify_jwt = false`
  - `[functions.pause-campaign] verify_jwt = false`
- Keep strict in-code auth checks (service/admin/internal key validation) so security remains server-side.

2) Fix instant trigger reliability for guard-paused updates
- New migration:
  - Recreate `public.instant_guard_pause()` with stronger safeguards:
    - validate required secrets exist before posting
    - keep idempotent trigger condition (`old.status IS DISTINCT FROM 'guard_paused'`)
    - post exact payload contract used by `pause-campaign` (`campaign_id`, `action: "pause"`)
  - Drop/recreate `trg_instant_guard_pause` idempotently.
- Keep this trigger as instant path (1–3s).

3) Remove “next-cycle” delay inside Ad Guard engine
- File: `supabase/functions/ad-guard-check/index.ts`
- Change Phase 2 behavior:
  - when low-balance campaigns are newly flagged, immediately execute platform pause logic in the same run (reuse existing `pauseOnPlatform` helpers), not “next cycle”.
- Add optional `client_id` request filter for targeted instant enforcement when needed.
- Improve auth acceptance for trusted internal tokens and add explicit rejection logging reason.

4) Prevent sync jobs from undoing guard pauses
- File: `supabase/functions/sync-deep-dive/index.ts`
- Build a set of guard-locked campaign IDs from `profiles.system_paused_campaigns`.
- In campaign upsert/update logic:
  - if campaign is guard-locked, preserve DB status (`guard_paused` / guarded paused state) and do not overwrite with platform “enable/active” status.
- This keeps Ad Guard state authoritative until manual/auto resume clears lock.

5) Keep resume behavior intact
- Ensure existing resume paths still work:
  - manual resume (single/all) and auto-resume after deposit
  - when resumed, campaign is removed from `system_paused_campaigns`, then sync is allowed to reflect platform active state again.

6) Verification (end-to-end, no guesswork)
- Trigger low-balance condition on a test client with active campaigns.
- Confirm within seconds:
  - `campaigns.status` moves from active/enable → guard_paused/paused
  - platform campaign status becomes paused
  - Client Ad Guard tab + Spend tab + Ad Account view all agree
- Confirm backend logs:
  - no 401 for internal Ad Guard/pause calls
  - successful pause audit entries
  - no later sync overwrite back to active while guard lock is present.

Files to change
- `supabase/config.toml`
- `supabase/migrations/<new>_ad_guard_instant_hardening.sql`
- `supabase/functions/ad-guard-check/index.ts`
- `supabase/functions/sync-deep-dive/index.ts`
