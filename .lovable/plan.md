

# Plan: Client Urgent Notice System

## Overview
A targeted notification system where admins create time-limited urgent notices that appear as a prominent banner in the client dashboard. Notices can target specific client segments (all, negative balance, specific ad accounts, individual clients).

## Database

### New table: `client_notices`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| title | text | Short headline |
| message | text | Notice body |
| type | text | `info`, `warning`, `urgent` (controls color) |
| target_type | text | `all`, `negative_balance`, `ad_account`, `specific_clients` |
| target_ids | uuid[] | Used when target_type is `ad_account` or `specific_clients` — stores ad_account IDs or client user IDs |
| starts_at | timestamptz | When to start showing |
| ends_at | timestamptz | When to stop showing |
| is_active | boolean | Manual on/off toggle |
| created_by | uuid | Admin who created it |
| created_at | timestamptz | Default now() |

**RLS**: Admins get full CRUD. Clients get SELECT on active notices within their time window (filtering by target happens in app code since it requires balance/account lookups).

### Migration SQL
- Create the table with RLS enabled
- Admin ALL policy
- Client SELECT policy: `is_active = true AND starts_at <= now() AND (ends_at IS NULL OR ends_at > now())`

## Admin UI — Manage Notices

### New page: `src/pages/ClientNotices.tsx`
- Route: `/admin/client-notices` (add to AdminLayout nav)
- List all notices with status badge (Active/Expired/Scheduled)
- "Create Notice" dialog with:
  - Title, Message, Type (info/warning/urgent)
  - Target selector: dropdown with `All Clients`, `Negative Balance`, `Specific Ad Account`, `Specific Clients`
  - When "Specific Ad Account" → multi-select of ad accounts
  - When "Specific Clients" → multi-select of clients
  - Start date/time, End date/time
- Edit and delete existing notices
- Toggle active/inactive

## Client-Side Display

### New component: `src/components/ClientNoticeBanner.tsx`
- Fetches active notices from `client_notices` where `is_active = true` and within time window
- Client-side filtering based on `target_type`:
  - `all` → show to everyone
  - `negative_balance` → show only if client's computed balance < 0
  - `ad_account` → show if client has any ad account in `target_ids` (query `ad_account_clients`)
  - `specific_clients` → show if `auth.uid()` is in `target_ids`
- Renders as a dismissible banner between the header and hero section in `ClientDashboard.tsx`
- Color-coded: blue (info), amber (warning), red (urgent with pulse animation)
- Dismissible per-session via local state (not persisted — notice reappears on refresh if still active)

### Integration point: `src/pages/ClientDashboard.tsx`
- Import and render `<ClientNoticeBanner />` at the top of the return JSX, above the hero card
- Pass `balance` and `effectiveClientId` as props for target filtering

## Files Modified/Created

1. **DB migration** — Create `client_notices` table + RLS policies
2. **`src/pages/ClientNotices.tsx`** — New admin management page
3. **`src/components/ClientNoticeBanner.tsx`** — New client-facing banner component
4. **`src/pages/ClientDashboard.tsx`** — Add `<ClientNoticeBanner />` above hero
5. **`src/App.tsx`** — Add route `/admin/client-notices`
6. **`src/components/AdminLayout.tsx`** — Add nav link for "Client Notices"

