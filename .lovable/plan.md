## Goal

Change auto-resume so it only fires when an **approved payment request** lands within a configurable **grace window** (default 2 hours) from the moment Ad Guard paused the client's campaigns. Beyond that window → no auto-resume, admin/client must resume manually. When it does fire, resume must hit the actual ad platform (Meta / TikTok / Google), not just flip DB status.

## Behavior changes

**Today**
- Any `credit` transaction that lifts balance above threshold auto-resumes all `system_paused_campaigns` (via `check_auto_resume` trigger).
- Resume only flips `campaigns.status = active` in DB. No platform API call.

**After**
- Deposit-only balance recovery does **not** auto-resume anymore.
- When a `payment_request` is **approved**, check `now() - profiles.guard_paused_at`:
  - Within grace window → auto-resume DB + call new `resume-campaign` edge function per campaign.
  - Beyond window → do nothing (client sees campaigns still paused, must resume manually).
- Grace window is a per-agency setting on `organizations.auto_resume_window_minutes` (default 120), editable in **Settings → Automation**.

## Technical breakdown

### 1. Schema (migration)
- `ALTER TABLE public.organizations ADD COLUMN auto_resume_window_minutes integer NOT NULL DEFAULT 120;`
- `ALTER TABLE public.guard_pause_jobs` — reuse table for resume jobs by adding `action text NOT NULL DEFAULT 'pause'` (values: `pause` | `resume`).

### 2. Database triggers (migration)
- **Rewrite `check_auto_resume`**: keep the payment-approval path only (`description LIKE 'Payment:%'`), remove the balance-recovery path. Before resuming, read `organizations.auto_resume_window_minutes` and check `now() - profiles.guard_paused_at <= window`. If outside window, exit; log `ad_guard_resume_skipped_window` audit entry.
- On resume path, after flipping campaign status, enqueue a `resume` job into `guard_pause_jobs` for each previously paused campaign so the edge function can hit the platform API.
- Existing `reset_overdraft_on_payment_approval` stays as-is.

### 3. New edge function `resume-campaign`
- Mirror of `pause-campaign`: takes `{ campaign_id, action: "resume" }`, loads the campaign + ad account creds, calls the appropriate platform API to set status back to `ACTIVE` / `ENABLE`:
  - Meta: `POST /{campaign_id}` `status=ACTIVE`
  - TikTok: `/campaign/status/update/` `operation_status=ENABLE` (via US proxy)
  - Google Ads: campaign mutate `status=ENABLED`
- Same auth pattern (service-role or anon), same error handling / audit logging as `pause-campaign`.

### 4. Update `ad-guard-check` edge function
- Add a **Phase 4** that processes `guard_pause_jobs` where `action = 'resume'`: batch of 5, call `resume-campaign`, on success delete job + set `pause_confirmed_at = null`, on failure back off with retry (same pattern as pause).
- Existing pause phases untouched.

### 5. Frontend
- **`AutomationConfigTab.tsx`** (Settings → Automation): add a numeric input "Auto-resume grace window (minutes)" bound to `organizations.auto_resume_window_minutes` with helper text: *"After Ad Guard pauses campaigns, approved payments within this window auto-resume campaigns on the ad platform. Beyond it, resume must be done manually."*
- **`LowBalanceAlerts.tsx` / guard notification body**: mention the window (e.g. "Pay within 2 hours to auto-resume").
- No other UI churn.

### 6. Audit + notifications
- New audit `action_type`: `ad_guard_resume_skipped_window` when payment approved but window expired.
- Existing `notify_on_guard_resume` keeps working; add a branch for the window-expired case: notify client "Payment approved ✅ — campaigns not auto-resumed (grace window expired). Resume manually from the campaign list."

## Files touched

- `supabase/migrations/<new>.sql` — column, trigger rewrite, `guard_pause_jobs.action`.
- `supabase/functions/resume-campaign/index.ts` — new.
- `supabase/functions/ad-guard-check/index.ts` — add Phase 4 (resume queue).
- `src/components/AutomationConfigTab.tsx` — grace window input.
- `src/components/LowBalanceAlerts.tsx` — copy tweak (optional).

## Out of scope

- Changing pause behavior or thresholds.
- Bulk manual resume UI (already exists via campaign management hub).
- Notification wording overhaul beyond the one grace-window line.
