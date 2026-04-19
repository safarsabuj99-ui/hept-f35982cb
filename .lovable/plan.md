

## Smart Notifications v2 — Intelligent Hub

### Why upgrade
Current system: solid foundation (realtime + push + grouping + 4 priorities). What's missing: **user control over noise**, **delivery intelligence**, **richer context**, **organization at scale**.

### What gets built (5 pillars)

**1. Quiet Hours + Do Not Disturb**
- Per-user nightly window (e.g. 11pm–7am Asia/Dhaka). During quiet hours, only `urgent` triggers push/sound; `normal` & `low` queue silently for in-app delivery.
- One-tap "Snooze 1h / Until tomorrow" from bell header.
- Stored in `notification_preferences_v2` (extends current table with `quiet_start`, `quiet_end`, `snoozed_until`, `dnd_enabled`).

**2. Smart Daily Digest**
- New cron job (`notification-digest`, runs 9am Dhaka) bundles all unread `low`/`normal` notifications from last 24h into ONE summary notification: *"You have 12 updates: 4 payments, 6 guard alerts, 2 campaigns"* — clicking opens the inbox pre-filtered.
- User toggle in Settings → Notifications: "Daily digest instead of individual alerts" (opt-in).
- Reduces 50+ daily pings to 1, while keeping urgent ones instant.

**3. Granular Smart Rules (per-type x per-priority)**
Replace the current 4-type x 2-channel grid with a richer matrix:

| Type | In-App | Push | Sound | Email* | Min Priority |
|---|---|---|---|---|---|
| Payment | ✓ | ✓ | ✓ | ✓ | normal |
| Guard | ✓ | ✓ | ✓ | — | high |
| Campaign | ✓ | — | — | — | normal |

(*Email channel scaffolded but disabled until domain verified — wired through existing `send-email` function.)

User can set "only push me when ≥ high priority" per type, eliminating routine noise.

**4. Snooze + Pin + Archive (per-notification actions)**
- Add `snoozed_until`, `is_pinned`, `archived_at` columns to `notifications`.
- Bell + inbox: swipe-right to snooze (1h/4h/tomorrow), swipe-left to delete (existing), tap-pin to keep at top.
- Snoozed items hide from bell until time elapses, then re-surface as fresh.

**5. Inbox 2.0 — Smart Sections**
Reorganize `/admin/notifications` page:
- **Pinned** (sticky top)
- **Action Required** — unread urgent/high (red accent)
- **Today** — unread normal/low
- **Snoozed** — countdown timer per item
- **Earlier** — read history, infinite scroll

Plus: **mute by group_key** (e.g. mute `guard_pause_<clientId>` for 24h after first pause to stop spam during balance recharges).

### Backend changes

**Schema (migration):**
```sql
-- notifications: add lifecycle columns
ALTER TABLE notifications
  ADD COLUMN snoozed_until timestamptz,
  ADD COLUMN is_pinned boolean DEFAULT false,
  ADD COLUMN archived_at timestamptz;

-- preferences: extend with smart settings
ALTER TABLE notification_preferences
  ADD COLUMN min_priority text DEFAULT 'low',  -- low | normal | high | urgent
  ADD COLUMN quiet_start time,
  ADD COLUMN quiet_end time,
  ADD COLUMN dnd_until timestamptz,
  ADD COLUMN digest_enabled boolean DEFAULT false;

-- mutes table: group_key suppression
CREATE TABLE notification_mutes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  group_key text NOT NULL,
  muted_until timestamptz NOT NULL,
  UNIQUE(user_id, group_key)
);
```

**Edge functions:**
- `notification-digest` (new, cron 9am daily) — bundles low/normal unreads into 1 summary.
- `send-push` (modify) — check `quiet_start/end`, `dnd_until`, `min_priority`, and `notification_mutes` before sending. Skip if filtered (still inserts in-app).
- DB trigger `trigger_send_push` (modify) — pass priority through; skip route if mute exists.

### Frontend changes

| File | Change |
|---|---|
| `src/hooks/useNotifications.tsx` | Add `snoozeNotification`, `pinNotification`, `muteGroup` actions. Filter out snoozed items from bell list. |
| `src/components/NotificationBell.tsx` | New "Snooze all" button, swipe-right to snooze gesture, pinned section pinned at top, DND indicator when active. |
| `src/pages/Notifications.tsx` | Rebuild as Inbox 2.0 with Pinned / Action Required / Today / Snoozed / Earlier sections. |
| `src/components/settings/NotificationsTab.tsx` | New rich matrix with min-priority dropdown per type, quiet hours time pickers, digest toggle, DND quick-set. |
| `supabase/functions/notification-digest/index.ts` | New: bundles low/normal unreads, single push at 9am. |
| `supabase/functions/send-push/index.ts` | Add quiet-hours/DND/priority/mute gating before web-push send. |

### Why this is "most advanced"
- **User-driven noise reduction** (digest, quiet hours, min-priority) — each user tunes their own signal/noise ratio.
- **Lifecycle actions** (snooze, pin, mute, archive) — treats notifications as a first-class inbox.
- **Smart routing** at delivery time (send-push checks gates) — no wasted pushes during quiet hours.
- **Organized inbox** — sections by intent, not just chronological.
- **Backward compatible** — existing notifications keep working; new columns default-off.

### Build time
~45 min: 1 migration, 2 edge function changes (1 new, 1 patch), 4 frontend files. Zero breaking changes.

