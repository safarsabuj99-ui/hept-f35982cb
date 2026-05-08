## Goal

When Ad Guard pauses a client's campaigns, automatically transition them back to **active** in two ways, and surface the resume event in an Ad Guard history panel that shows the last 24 hours of activity.

Two resume paths:
1. **Payment approved → instant resume** (regardless of threshold).
2. **API sync detects campaign is active on the platform → reconcile local status to active** (today the sync deliberately preserves `guard_paused`).

Both paths should: clear the client's paused-campaigns list, set campaign status back to `active`, and write an `ad_guard_resume` row to `audit_logs` with a reason — so the new history panel renders the transition.

---

## Changes

### 1. DB trigger — resume on approved payment (`check_auto_resume`)

Currently this trigger only resumes if the new balance exceeds the auto-pause threshold. Update it so that **any approved payment credit** (i.e. any `INSERT` into `transactions` where `type='credit' AND status='completed'` originating from an approved payment request) clears Ad Guard pause for that client:

- Re-activate every campaign listed in `profiles.system_paused_campaigns` (status `guard_paused` / `paused` → `active`, clear `pause_required`, `pause_requested_at`, `pause_attempt_count`, `pause_error`).
- Delete corresponding rows from `guard_pause_jobs`.
- Reset `profiles.system_paused_campaigns = []` and `profiles.guard_paused_at = NULL`.
- Insert an `audit_logs` row of type `ad_guard_resume` with description `Auto-resumed N campaigns after payment approval (reason: payment_approved)`.

Keep the existing balance-threshold path as a fallback so deposits via other channels still work.

### 2. Sync reconciliation — platform "active" wins over `guard_paused`

In `supabase/functions/sync-deep-dive/index.ts` (`upsertCampaign`, around line 275), today the code preserves `guard_paused` even when the platform reports active. Replace that with:

- If `existing.status === 'guard_paused'` AND `statusConfirmed === true` AND the platform-reported `status` is active → set `finalStatus = 'active'`, clear `pause_required` / `pause_error` on the row, and **enqueue an `audit_logs` row of type `ad_guard_resume`** with description `Campaign auto-resumed: detected active on <platform> during sync`.
- Also remove that campaign id from the owning client's `profiles.system_paused_campaigns` array and from `guard_pause_jobs`. If the array becomes empty, also null out `guard_paused_at`.
- If platform reports paused/inactive → keep current preserve-guard behavior.

This is done inside the existing service-role `supabase` client (no new secrets, no schema changes). We collect the affected client ids per account and do one cleanup pass at the end of each account loop to keep writes batched.

Apply the same reconciliation logic to `supabase/functions/sync-fast-lane/index.ts` if it also writes campaign status (verify when implementing — if it doesn't touch status, no change there).

### 3. Ad Guard history panel (last 24 hours)

In `src/components/AutomationConfigTab.tsx`, add a new card **"Ad Guard History (24h)"** below the existing Paused Campaigns card. It queries `audit_logs` for the current client filtered by:

- `user_id = clientId`
- `action_type IN ('ad_guard_pause', 'ad_guard_resume', 'ad_guard_critical_error', 'ad_guard_window_expired')`
- `created_at >= now() - interval '24 hours'`
- ordered by `created_at desc`

Each row shows a colored badge (red for pause, green for resume), the timestamp (relative + absolute on hover), and the description. Empty state: "No Ad Guard activity in the last 24 hours." A small live realtime subscription on `audit_logs` (filtered by the same `user_id`) keeps the panel fresh while the admin watches.

No new tables, no new edge function, no new RLS — `audit_logs` already exists and is readable for admins via existing policies.

---

## Technical notes

- The trigger update is a single `CREATE OR REPLACE FUNCTION public.check_auto_resume()` migration. We branch on `NEW.description LIKE 'Payment:%'` (the marker `approve-payment` already writes) to take the "payment approved" fast path; otherwise fall back to the current threshold logic.
- The 24h window in the UI is purely a query filter; the audit rows themselves persist longer for the global Audit Logs page.
- No changes to `pause-campaign`, `ad-guard-check`, RLS, or any client/agency facing routes other than the Automation tab inside `ClientDetail`.

## Files touched

- `supabase/migrations/<new>.sql` — replace `public.check_auto_resume`.
- `supabase/functions/sync-deep-dive/index.ts` — reconcile guard_paused → active when platform says active.
- `supabase/functions/sync-fast-lane/index.ts` — same reconciliation if it writes status.
- `src/components/AutomationConfigTab.tsx` — add 24h Ad Guard History card with realtime refresh.