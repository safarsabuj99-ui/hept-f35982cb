## Goal

Make the global client search popup (⌘K / Ctrl+K) openable from **every agency page** — not only the Admin Dashboard. Today it only works on `/admin` because `ClientSearchCommand` is mounted inside `QuickActions`, which lives only on the dashboard.

## Approach

Lift the search popup to the **layout level** so it stays mounted on every admin and manager route. Give it its own lightweight data source (shared with the dashboard via React Query cache) so it doesn't depend on dashboard props.

### 1. New shared hook: `useGlobalClientSearch`

Create `src/hooks/useGlobalClientSearch.ts`:
- Calls the existing `get_admin_dashboard_summary` RPC (today range, current `org_id`).
- Returns just the enriched `clients` array (same shape as `ClientWithBalance`).
- Uses a stable React Query key (e.g. `["global-client-search", orgId]`) with `staleTime: 60s` so it shares cache with the dashboard and refreshes itself when other pages are open.
- Gated on `user && orgId` (follows existing query-gating pattern).

### 2. New component: `GlobalSearchMount`

Create `src/components/GlobalSearchMount.tsx`:
- Thin wrapper that calls `useGlobalClientSearch` and renders `<ClientSearchCommand clients={clients} />`.
- Renders nothing while loading (popup just shows empty state until data arrives — keyboard shortcut still works).

### 3. Refactor `ClientSearchCommand`

Currently the component renders **both** the trigger button and the popup dialog. For layout-level mounting we only want the popup + keyboard listener globally; the dashboard's visible search bar should remain.

Split rendering via a new prop:
- `mode?: "full" | "hotkey-only"` (default `"full"`)
- `"full"`: existing behaviour — trigger button + dialog (used by dashboard `QuickActions`).
- `"hotkey-only"`: renders only the dialog + ⌘K listener (used by layouts).

Keyboard listener already exists and toggles `open` state — no changes needed beyond suppressing the visible trigger.

### 4. Mount in layouts

- `src/components/AdminLayout.tsx`: render `<GlobalSearchMount mode="hotkey-only" />` once inside `AdminLayout` (e.g. just before `<main>` or alongside header). Available on every `/admin/*` route.
- `src/components/ManagerLayout.tsx`: same mount so managers also get ⌘K. The RPC + clients list will respect their org/permissions via existing RLS.

### 5. Avoid duplicate hotkey on dashboard

`QuickActions` (dashboard) keeps its visible search bar via `mode="full"`. To prevent two popups from opening on ⌘K when dashboard is mounted, the `"full"` instance and the layout-mounted `"hotkey-only"` instance both listen — fix by:
- When `mode="full"`, only render trigger button + dialog but **skip** the global keyboard listener (the layout instance handles it).
- The layout-mounted dialog is the single source of truth for ⌘K everywhere, including the dashboard.

This keeps the dashboard's pretty search bar intact while the global hotkey lives at the layout.

## Files to change

- **NEW** `src/hooks/useGlobalClientSearch.ts` — shared lightweight client list query.
- **NEW** `src/components/GlobalSearchMount.tsx` — layout wrapper that mounts the popup.
- **EDIT** `src/components/dashboard/ClientSearchCommand.tsx` — add `mode` prop; only attach ⌘K listener when not in `"full"` (layout-only).
- **EDIT** `src/components/AdminLayout.tsx` — mount `<GlobalSearchMount mode="hotkey-only" />`.
- **EDIT** `src/components/ManagerLayout.tsx` — mount `<GlobalSearchMount mode="hotkey-only" />`.
- **EDIT** `src/components/dashboard/QuickActions.tsx` — pass `mode="full"` (visible bar without hotkey listener).

No DB / RPC / migration changes.

## Result

- ⌘K / Ctrl+K opens the smart Command Center popup from **any** admin or manager page (Clients, Campaigns, Finance, Payments, Settings, Wallet, etc.).
- Dashboard still shows its visible search bar at the top.
- All existing smart features (KPI strip, recents, status badges, multi-field search, quick actions) work unchanged.
