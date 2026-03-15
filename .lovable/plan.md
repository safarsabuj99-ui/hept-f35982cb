

## Plan: Fix & Enhance Ad Guard History

### Bug Found
The guard history query is broken. It filters `audit_logs` by `.eq("user_id", userId)` (the client's ID), but the `ad-guard-check` edge function logs pause events with `user_id: caller.id` (the **admin** who triggered the scan). Only auto-resume events (from the DB trigger) use the client's ID. So pause events never show up in history.

### Fix Strategy

**1. Fix the edge function to include client ID in logs** (`supabase/functions/ad-guard-check/index.ts`)
- Change `user_id: caller.id` to `user_id: profile.user_id` so the audit log is associated with the client, not the admin
- Keep the admin context in the description text instead

**2. Fix the history query to also search by description** (`src/components/AutomationConfigTab.tsx`)
- For existing logs that used the admin's user_id, also search by description containing the client's name (fetched from profile)
- Use `.or()` filter: `user_id.eq.{userId},description.ilike.%{clientName}%` combined with the action_type filter
- Simpler approach: just remove the `user_id` filter and filter by action_type + description containing client name using `.ilike("description", `%${clientName}%`)`

**3. Enhanced Guard History UI** — replace the simple timeline with:

- **Summary Stats Row** (3 mini cards):
  - Total Times Paused (count of `ad_guard_pause` events)
  - Total Times Resumed (count of `ad_guard_resume` events)  
  - Last Guard Event date/time with relative time ("2 hours ago")

- **Rich History Table** replacing the current timeline:
  - Columns: Event (Pause/Resume badge), Details (parsed from description — campaigns count, balance snapshot), Date & Time (formatted with relative time)
  - Show up to 20 events (increased from 10)
  - Color-coded rows: red tint for pauses, green tint for resumes

### Files to Change

1. **`supabase/functions/ad-guard-check/index.ts`** — Change audit log `user_id` from `caller.id` to `profile.user_id`

2. **`src/components/AutomationConfigTab.tsx`**:
   - Accept `clientName` prop (or fetch from profile)
   - Update query: filter by `action_type` + `description.ilike` matching client name (no user_id filter)
   - Add summary stats section with pause/resume counts and last event
   - Upgrade history timeline to a table with parsed details and relative timestamps
   - Increase limit from 10 to 20

