

## Real-Time Notification System

### What You'll Get
A complete in-app notification system that delivers instant alerts to both admin and client browsers (mobile or laptop) whenever key events happen — no page refresh needed.

### Events That Trigger Notifications

| Event | Who Gets Notified |
|---|---|
| Client submits a payment request | Admin |
| Admin approves/rejects payment | Client |
| Ad Guard triggers & pauses campaigns | Client + Admin |
| Ad Guard auto-resumes campaigns | Client + Admin |
| Campaign request submitted | Admin |
| Campaign request approved/rejected | Client |

### Architecture

```text
Event happens (e.g. payment approved)
  → Edge function / DB trigger inserts row into `notifications` table
  → Supabase Realtime broadcasts the INSERT
  → All open browser tabs (mobile/laptop) receive it instantly
  → Bell icon shows unread count badge
  → Click bell → dropdown shows notification list
  → Click notification → navigates to relevant page
```

### Changes

**1. Database — `notifications` table + trigger**
- New table: `notifications` with columns: `id`, `user_id` (recipient), `title`, `body`, `type` (payment, guard, campaign, system), `is_read`, `link` (URL to navigate to), `created_at`, `org_id`
- RLS: users read/update only their own notifications; service role inserts
- Enable Realtime publication on the table
- New DB trigger `notify_on_payment_status_change`: fires on `payment_requests` UPDATE when status changes to approved/rejected → inserts notification for the client
- New DB trigger `notify_on_guard_pause`: fires on `campaigns` UPDATE when status changes to `guard_paused` → inserts notification for both the client AND all admins in the org
- New DB trigger `notify_on_guard_resume`: fires on `campaigns` UPDATE when status changes from `guard_paused`/`paused` to `active` (auto-resume) → inserts notification for client + admins
- New DB trigger `notify_on_payment_request_created`: fires on `payment_requests` INSERT → inserts notification for all admins
- New DB trigger `notify_on_campaign_request`: fires on `campaign_requests` INSERT/UPDATE → notifies admin on new request, client on status change

**2. React — NotificationBell component**
- New `src/hooks/useNotifications.tsx`: subscribes to Realtime `postgres_changes` on `notifications` table filtered by `user_id = auth.uid()`, maintains unread count and recent list
- New `src/components/NotificationBell.tsx`: bell icon with red badge (unread count), click opens dropdown/popover showing recent notifications with timestamps, mark-as-read on click, "Mark all read" button, "View all" link
- Plays a subtle sound or shows a toast when a new notification arrives in real-time
- Integrate into `AdminLayout`, `ClientLayout`, and `ManagerLayout` header bars

**3. Notification Management Page**
- New `src/pages/Notifications.tsx`: full-page view of all notifications with filters (type, read/unread, date range), bulk mark-as-read, bulk delete
- Route: `/admin/notifications`, `/dashboard/notifications`, `/manager/notifications`

**4. Update existing edge functions to create notifications**
- `approve-payment/index.ts`: after approval/rejection, insert notification for the client
- `ad-guard-check/index.ts`: after successful pause confirmation, insert notification for client + admins
- `pause-campaign/index.ts`: on successful platform pause, insert notification

### Technical Details
- Realtime subscription uses channel filter `eq('user_id', currentUserId)` for efficiency
- Notifications auto-expire after 30 days via a scheduled cleanup (optional, Phase 2)
- The `notifications` table uses a composite index on `(user_id, is_read, created_at)` for fast queries
- DB triggers use `SECURITY DEFINER` to bypass RLS when inserting notifications for other users
- Guard pause notifications are deduplicated: one notification per client per guard event (not per campaign)

