## Problem

The DB trigger `notify_on_guard_resume` fires on **any** campaign status change from `paused`/`guard_paused` → `active` and always says *"{client}'s campaigns auto-resumed after deposit."* — even when an admin/manager manually resumes a campaign or bulk-activates from the campaign hub. Result: misleading notifications like "Niloy's campaigns auto-resumed after deposit" when no deposit happened.

## Fix

Two database changes (no UI code edits needed — `useNotifications` just displays whatever the DB writes).

### 1. Tag deposit-driven resumes

Update `check_auto_resume()` (the trigger that runs on a `transactions` credit and flips paused campaigns back to active) to set a session-local marker before its `UPDATE public.campaigns SET status = 'active'`:

```text
PERFORM set_config('app.guard_auto_resume', 'true', true);
```

This GUC lives only for the duration of the current statement, so it cannot leak across requests.

### 2. Branch `notify_on_guard_resume` on that marker

Rewrite the trigger to read the marker and pick one of two notification paths:

- **Auto path** (`app.guard_auto_resume = 'true'`): keep the existing wording.
  - Client: "Campaigns Resumed ✅ — Your campaigns have been resumed after balance top-up."
  - Admins: "Campaigns Resumed — {client}'s campaigns auto-resumed after deposit."

- **Manual path** (marker not set → admin/manager toggled status, bulk-activate, platform-side flip, etc.):
  - Client: "Campaign Resumed ▶️ — Your campaign was resumed by your account manager."
  - Admins: "Campaign Resumed — {client}'s campaign was manually resumed."
  - Link unchanged (`/admin/clients/{id}?tab=automation` for admins, `/dashboard?highlight=resumed` for clients).

The 30-second dedup guard stays, but the title check is widened so the two variants don't double-fire.

### Technical details

- Touched objects: `public.check_auto_resume()` (1 line added), `public.notify_on_guard_resume()` (rewrite body).
- Trigger bindings on `campaigns` and `transactions` stay as-is.
- `notify_on_guard_pause` and `check_auto_resume`'s resume logic, audit log entries, and pg_net push delivery are untouched.
- No frontend changes; `NotificationBell`, `useNotifications`, and the push trigger render whatever title/body the DB inserts.
- Reads `current_setting('app.guard_auto_resume', true)` (the second arg suppresses the "unrecognised parameter" error when unset).

### Not touched

- Existing historical "Campaigns Resumed" rows in the `notifications` table — only future events use the new wording.
- The threshold-based legacy path inside `check_auto_resume` (deposit detection covers it).
- Client-side ad-guard UI, settings, or thresholds.
