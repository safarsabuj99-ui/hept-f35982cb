

## Professional Notification System Upgrade

### Current State
The notification system works but is basic: plain text toasts, flat card list, simple type dot indicators, no grouping, no priority levels, no notification preferences, and no sound/vibration feedback. The bell popover is functional but lacks polish expected in a premium SaaS.

### Upgrade Plan

**Step 1: Add Priority & Grouping to DB** (Migration)
- Add `priority` column (`low`, `normal`, `high`, `urgent`) to `notifications` table with default `normal`
- Add `group_key` column (nullable text) for collapsing related notifications (e.g., multiple guard pauses for same client get grouped)
- Update existing trigger functions to set appropriate priority levels:
  - `urgent`: Ad Guard pause, payment rejected
  - `high`: New payment request, campaign request
  - `normal`: Payment approved, campaign approved, guard resumed
  - `low`: System announcements

**Step 2: Notification Preferences Table** (Migration)
- Create `notification_preferences` table: `user_id`, `channel` (in_app, push, email), `type` (payment, guard, campaign, system), `enabled` (boolean), with RLS for own-row access
- Seed defaults on profile creation via trigger
- This lets users mute specific notification types per channel

**Step 3: Redesign NotificationBell Popover** (`NotificationBell.tsx`)
- **Segmented header tabs**: "All | Unread | Urgent" quick filters inside the popover
- **Rich notification cards**: Type-specific icons (Shield for guard, CreditCard for payment, Megaphone for campaign) instead of plain dots
- **Priority indicator**: Urgent notifications get a pulsing red left-border accent; high priority gets amber
- **Smart grouping**: Collapse 3+ notifications with same `group_key` into "X notifications about [topic]" with expand
- **Swipe-to-dismiss** on mobile via touch handlers
- **Sound toggle**: Small speaker icon in header to enable/disable notification sounds
- **Empty state**: Illustration with contextual message based on role

**Step 4: Redesign Notifications Full Page** (`Notifications.tsx`)
- **Timeline layout**: Group notifications by date sections ("Today", "Yesterday", "This Week", "Earlier")
- **Bulk actions toolbar**: Select multiple notifications via checkboxes, bulk delete/mark read
- **Search**: Add a search input to filter notifications by title/body text
- **Infinite scroll**: Replace the 50-item limit with paginated loading (load 20, fetch more on scroll)
- **Priority badges**: Colored badges (red urgent, amber high) next to type badges
- **Glass-card styling**: Apply `glass-card glow-border` and `animate-slide-up-fade` consistent with the rest of the app

**Step 5: Smart Toast System** (`useNotifications.tsx`)
- Replace plain `toast()` with priority-aware toasts:
  - Urgent: `toast.error()` with persistent duration (10s), sound chime, and action button ("View Now")
  - High: `toast.warning()` with 6s duration and action button
  - Normal: `toast.success()` with 4s default
  - Low: `toast.info()` with 3s, auto-dismiss
- Add a subtle notification sound effect (HTML5 Audio) for urgent/high priority (respecting user's sound preference)
- Vibration API (`navigator.vibrate`) on mobile for urgent notifications

**Step 6: Notification Preferences UI** (`Settings.tsx`)
- Add a "Notifications" tab/section in Settings page
- Matrix grid: rows = notification types (Payment, Guard, Campaign, System), columns = channels (In-App, Push)
- Toggle switches for each cell
- "Quiet Hours" time range picker (suppress non-urgent notifications between set hours)
- "Sound" toggle for notification audio

**Step 7: Auto-cleanup & Retention**
- Add a DB function `cleanup_old_notifications()` that deletes read notifications older than 30 days and unread older than 90 days
- Schedule via pg_cron (daily at 3 AM)

### Files Changed (~8 files)

| File | Change |
|------|--------|
| **Migration SQL** | Add `priority`, `group_key` columns; create `notification_preferences` table; update trigger functions with priority; add cleanup function + cron |
| `useNotifications.tsx` | Priority-aware toasts, sound/vibration, infinite scroll support, grouped notifications logic |
| `NotificationBell.tsx` | Complete redesign with tabs, rich icons, priority accents, grouping, swipe-to-dismiss |
| `Notifications.tsx` | Timeline layout, search, bulk actions, infinite scroll, glass-card styling |
| `Settings.tsx` | Add notification preferences section with toggle matrix |
| `index.css` | Priority-specific animation classes (urgent pulse, notification slide-in) |

### What Stays Unchanged
- Push notification infrastructure (VAPID, service worker, send-push edge function)
- Deep-linking system (useDeepLinkAction)
- Realtime subscription channel
- Notification DB triggers (only adding priority field to existing INSERT statements)

