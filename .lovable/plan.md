
## Problem

1. **Double-close animation** — On both mobile and desktop, closing the search popup shows a close animation, then a *second* dialog appears still open and has to be closed again.
2. **Missing profiles** — Some clients (e.g. Yasin Arafat) never appear in the search list, even though the database confirms they exist as clients in the org.

## Root causes (verified)

**Double dialog:** The `ClientSearchCommand` component is mounted **three times on the dashboard** and **two times on other admin pages**:
- `QuickActions` on the dashboard renders one instance (`mode="full"`) — this is the visible search bar / mobile pill trigger.
- `GlobalSearchMount` (in `AdminLayout` / `ManagerLayout`) renders one instance (`mode="hotkey-only"`) for the ⌘K listener.
- `GlobalSearchMount` also renders `MobileDoubleTapSearch` — another full instance controlled by the double-tap gesture.

Each instance keeps its own local `open` state, and each renders its own Radix `Dialog.Portal` with its own overlay and content. When the user opens via one path (e.g. clicks the search bar, then also presses ⌘K, or the double-tap fires while another is closing), two dialogs mount at the same time; closing the top one plays its exit animation and reveals the second one still open.

**Missing profiles:** Confirmed via DB query that Arafat is returned by `get_admin_dashboard_summary` (46 clients total). So the data layer is fine. The disappearance happens because different mount points use different query hooks with different cache keys / staleness:
- `QuickActions` uses `data.clients` from `useAdminDashboardData` (dashboard-scoped, updates with date range).
- `GlobalSearchMount` uses `useGlobalClientSearch` (separate query, may be stale or not yet loaded on non-dashboard pages).

Since we're already deduplicating dialogs, we also unify to a single source of truth for the client list — and add a defensive supplemental fetch so nobody is ever missing.

## Fix

### 1. One global dialog, shared open state

Introduce a tiny module-level store (`useSearchDialog`) with `open` / `setOpen` — a zustand-lite pattern using `useSyncExternalStore`. Any code path (hotkey, dashboard search bar click, mobile pill tap, double-tap gesture) simply calls `open()` on the shared store. Only the one instance mounted in `GlobalSearchMount` renders the Radix dialog.

Changes:
- New file `src/hooks/useSearchDialog.ts` — module-scoped subscribable store.
- `ClientSearchCommand`: reads/writes `open` from the shared store (falls back to controlled `forceOpen` only if not using the store). Remove the per-instance `internalOpen`.
- `QuickActions`: on both mobile and desktop, render **only a trigger** (the pretty search bar / the bottom pill) that calls `useSearchDialog().open()`. Do **not** mount another `ClientSearchCommand`.
- `MobileDoubleTapSearch`: strip the dialog render — the hook just calls `useSearchDialog().open()` when double-tap fires. Deleted or kept as a listener-only component.
- `GlobalSearchMount` remains the **only** place the dialog is rendered. It also owns the ⌘K listener (already does) and mounts the double-tap listener.

Result: only one dialog exists in the tree at any time, so the close animation cannot reveal a second one behind it.

### 2. Guarantee every client is searchable

- `useGlobalClientSearch` stays as the fast path (uses cached dashboard RPC data — 46 clients).
- Add a supplemental lightweight query in the same hook that fetches **all** client profiles directly from `profiles + user_roles + ad_account_clients` (id, name, email, business_name, phone, mapping_keyword, org_id, is_active) filtered by `org_id`. Union both sources by `user_id`, preferring RPC data (which has balance) and falling back to the profile row for anyone the RPC omitted, with `balance = 0` when not known.
- Ensures anyone with a `client` role in the org is present in the search list, even if they have no transactions/mapping/balance data for the RPC to compute.

### 3. Double-tap safety

- Add a small guard so the double-tap gesture cannot fire during the dialog's exit animation (300 ms lockout after `open → false`), preventing "close then re-open" flicker on rapid taps.

## Files touched

```text
NEW  src/hooks/useSearchDialog.ts              (shared open state)
EDIT src/components/dashboard/ClientSearchCommand.tsx
       - read/write open via useSearchDialog
       - keep forceOpen support as a fallback (unused after refactor)
EDIT src/components/dashboard/QuickActions.tsx
       - render trigger only (desktop bar / mobile pill); no dialog
EDIT src/components/MobileDoubleTapSearch.tsx
       - reduce to a listener-only component that calls store.open()
EDIT src/components/GlobalSearchMount.tsx
       - single dialog render; owns hotkey + double-tap listeners
EDIT src/hooks/useGlobalClientSearch.ts
       - union RPC clients with a direct profiles fallback so no
         client with role='client' in the org is ever missing
EDIT src/hooks/useDoubleTapGesture.ts
       - respect a short cooldown after the dialog closes
```

## Verification

- Open dashboard, click the search bar → close: single close animation, no ghost dialog.
- Same on `/admin/finance`, `/admin/clients`, etc. via ⌘K.
- On mobile: double-tap page → close via Done → no re-open flicker.
- Search "arafat" from any admin page → Yasin Arafat / Nakshi Bari appears in "All Clients".
- Spot check: type a substring of every group (mapping keyword, phone digits, business name) — matches surface.
