

## Plan: Ad Guard Pause Lock — Configurable Resume Window with Auto-Expiry

### Problem

When Ad Guard pauses campaigns, the resume option and "System Paused" status show indefinitely. The user wants:
1. After a configurable time (default 24h), **hide** the resume option and paused campaigns UI — campaigns stay paused permanently (no auto-resume).
2. Admin can configure the resume window duration per client.
3. Within the window: show paused campaigns + resume buttons. After window expires: clear the `system_paused_campaigns` array (so UI shows "Active" status) but **keep campaigns paused** (`is_active = false`). No auto-resume.

### Key Insight

Currently `system_paused_campaigns` serves dual purpose: (1) tracks which campaigns are paused, (2) drives the UI status badge. After the lock window expires, we need to clear it so the UI stops showing "Paused" status, but the campaigns themselves remain `is_active = false` in `campaign_mappings` — they're permanently paused until manually resumed from the campaign mappings page.

### Changes

**1. Database Migration — Add columns to `profiles`**

```sql
ALTER TABLE public.profiles
  ADD COLUMN guard_paused_at timestamptz DEFAULT NULL,
  ADD COLUMN guard_resume_window_hours integer NOT NULL DEFAULT 24;
```

- `guard_paused_at`: Timestamp when Ad Guard last paused campaigns (set by edge function)
- `guard_resume_window_hours`: Configurable hours for how long the resume window stays open (default 24)

**2. Edge Function: `ad-guard-check/index.ts`**

- When pausing campaigns, also set `guard_paused_at = new Date().toISOString()` on the profile update
- Include the resume window info in the audit log description

**3. Edge Function: Remove auto-resume from `check_auto_resume` trigger**

- Modify the `check_auto_resume()` DB function: Before auto-resuming, check if `guard_paused_at` is set and if `now() - guard_paused_at > guard_resume_window_hours`. If the window has expired, instead of resuming, clear `system_paused_campaigns` to `[]` (so UI shows Active) but do **NOT** set `is_active = true` on campaign_mappings. Campaigns stay permanently paused.
- If within the window and balance is sufficient, still allow auto-resume (existing behavior).

**4. UI: `AutomationConfigTab.tsx`**

- Accept new props: `guardPausedAt` (timestamp or null), `guardResumeWindowHours` (number)
- Add "Resume Window" input field next to threshold settings (hours, default 24)
- Save it alongside other settings
- Compute `isWithinResumeWindow`: if `guardPausedAt` exists and `now - guardPausedAt < windowHours`
- **Within window**: Show paused campaigns table with resume buttons + countdown timer showing time remaining (e.g., "Resume window: 18h 32m remaining")
- **After window expires**: Hide the paused campaigns card entirely. Show "Active" status. Campaigns remain paused in the background but the guard status resets.
- Show a subtle info note: "After the resume window expires, campaigns will remain paused and must be reactivated from Campaign Mappings."

**5. `ClientDetail.tsx`**

- Pass new props `guardPausedAt` and `guardResumeWindowHours` from the profile data to `AutomationConfigTab`

### Files to Change

1. **Database migration** — Add `guard_paused_at` and `guard_resume_window_hours` columns to `profiles`
2. **`supabase/functions/ad-guard-check/index.ts`** — Set `guard_paused_at` when pausing
3. **Database function `check_auto_resume()`** — Respect resume window; after expiry, clear status without resuming
4. **`src/components/AutomationConfigTab.tsx`** — Resume window config, countdown timer, conditional UI visibility
5. **`src/pages/ClientDetail.tsx`** — Pass new profile fields as props

