

## Unified Settings Hub with Tabbed Navigation

### Current State
Settings-related functionality is scattered across 4 separate pages:
- **Settings** (`/admin/settings`) — Service Margin, Sync Start Date, TikTok Proxy, Notification Preferences
- **My Profile** (`/admin/profile`) — Personal info, timezone, password change
- **Sync Health** (`/admin/sync-health`) — Sync intervals, manual triggers, logs
- **Integrations** (`/admin/integrations`) — API tokens for Meta/TikTok/Google

### Solution
Consolidate everything into a single **tabbed Settings page** at `/admin/settings`. The existing separate pages will redirect to the Settings page with the appropriate tab selected via `?tab=` query param.

### Tab Structure

| Tab | Icon | Content (moved from) |
|-----|------|---------------------|
| **General** | Settings | Service Margin, Sync Start Date, TikTok Proxy, Theme toggle, Default currency |
| **Profile** | UserCircle | Personal info form + Change Password (from AdminProfile) |
| **Integrations** | Plug | Full API integrations management (from Integrations page) |
| **Sync** | Activity | Sync schedule, manual triggers, sync logs (from SyncHealth page) |
| **Notifications** | Bell | Notification preferences matrix + sound toggle (already in Settings) |

### Changes

**1. `src/pages/Settings.tsx`** — Major rewrite
- Add `Tabs` component with 5 tabs: General, Profile, Integrations, Sync, Notifications
- Use `useDeepLinkAction` or `useSearchParams` to read `?tab=` param and auto-select the right tab
- Extract each section into its own tab content component for clean code organization
- Move existing cards into "General" tab
- Add Theme toggle (dark/light) and Default Currency toggle to General tab
- Move `NotificationPreferences` into its own "Notifications" tab
- Import and embed `AdminProfile` content into "Profile" tab
- Import and embed `Integrations` content into "Integrations" tab
- Import and embed `SyncHealth` content into "Sync" tab
- Max width expanded from `max-w-lg` to `max-w-4xl` to accommodate wider content like Integrations

**2. `src/pages/AdminProfile.tsx`** — Redirect wrapper
- Replace full page with a redirect: `<Navigate to="/admin/settings?tab=profile" replace />`

**3. `src/pages/SyncHealth.tsx`** — Redirect wrapper
- Replace full page with a redirect: `<Navigate to="/admin/settings?tab=sync" replace />`

**4. `src/pages/Integrations.tsx`** — Redirect wrapper
- Replace full page with a redirect: `<Navigate to="/admin/settings?tab=integrations" replace />`

**5. `src/components/AdminLayout.tsx`** — Simplify sidebar
- Remove separate "My Profile", "Sync Health" nav items from the System section (they now live inside Settings)
- Remove "Integrations" from the Advertising section
- Keep single "Settings" nav item that opens the unified hub

**6. Extract reusable content components**
- Extract `AdminProfile` form + password card into `src/components/settings/ProfileTab.tsx`
- Extract Integrations content into `src/components/settings/IntegrationsTab.tsx`
- Extract SyncHealth content into `src/components/settings/SyncTab.tsx`
- Keep `NotificationPreferences` as `src/components/settings/NotificationsTab.tsx`
- Keep General settings as inline in Settings.tsx or `src/components/settings/GeneralTab.tsx`

This keeps each tab's code isolated and the main Settings.tsx clean (~100 lines orchestrating tabs).

### Files Changed (~8 files)

| File | Change |
|------|--------|
| `src/pages/Settings.tsx` | Rewrite as tabbed hub with 5 tabs |
| `src/components/settings/GeneralTab.tsx` | New — margin, sync date, proxy, theme, currency |
| `src/components/settings/ProfileTab.tsx` | New — extracted from AdminProfile |
| `src/components/settings/IntegrationsTab.tsx` | New — extracted from Integrations |
| `src/components/settings/SyncTab.tsx` | New — extracted from SyncHealth |
| `src/components/settings/NotificationsTab.tsx` | New — extracted from Settings |
| `src/pages/AdminProfile.tsx` | Redirect to `/admin/settings?tab=profile` |
| `src/pages/SyncHealth.tsx` | Redirect to `/admin/settings?tab=sync` |
| `src/pages/Integrations.tsx` | Redirect to `/admin/settings?tab=integrations` |
| `src/components/AdminLayout.tsx` | Remove redundant sidebar items |

