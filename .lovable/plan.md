# Fix Client Dashboard Blinking / Constant Reload

## Root Cause

The client dashboard (`src/pages/ClientDashboard.tsx`) appears to "reload" repeatedly because of two issues working together:

### 1. Unfiltered global realtime listener (the main culprit)
In the realtime subscription:
```ts
.on('postgres_changes', { event: '*', schema: 'public', table: 'daily_metrics' }, debounced)
```
There is **no filter** on `daily_metrics`. So whenever the agency's sync engine writes metrics for **any client in the system**, every connected client's dashboard fires `fetchAll()`. During active syncs this happens many times a minute → constant refetch → constant re-render.

### 2. CSS entrance animations re-trigger on every state update
Elements use the classes `animate-fade-in`, `count-up`, and `stagger-1..4`. These animations run **every time the element is rendered**. Because the realtime listener forces a refetch every ~1.5s, the balance numbers and KPI cards re-play their fade/slide animation — visually that looks exactly like the screen is "blinking" or "reloading."

## Fix Plan (minimal, surgical, no feature changes)

### A. Scope the realtime listener to this client only
In `src/pages/ClientDashboard.tsx`, restrict the `daily_metrics` subscription so it only fires for rows belonging to this client. We already query campaigns by `client_id`; we will add a filter so only this client's metric updates trigger a refetch.

Approach: derive the client's `campaign_id` list once (we already fetch it inside `fetchAll`) and either
- subscribe to `campaigns` filtered by `client_id` (already present) **and**
- replace the unfiltered `daily_metrics` listener with a filter on `client_id` (the `daily_metrics` table includes `client_id` per the schema; if it doesn't on a given row we'll fall back to listening only to `campaigns` + `transactions`, which are already client-scoped).

Net effect: the dashboard only refetches when *this* client's data actually changes, not on every global sync write.

### B. Run the realtime refetch silently (no animation re-trigger)
Split loading state so background refetches don't replay entrance animations:
- Keep `initialLoading` for the very first load (skeleton).
- Move `animate-fade-in`, `page-enter`, `count-up`, and `stagger-*` so they render **only on initial mount**, not on every data refresh. The simplest way: gate those classes behind a `hasAnimatedRef` (set to `true` after first render) so subsequent updates render without re-applying the animation classes.

### C. Increase debounce window slightly
Bump the realtime debounce from 1500 ms to 2500 ms. Sync writes often arrive in bursts; a slightly larger window collapses the burst into a single quiet refetch.

## Files Touched
- `src/pages/ClientDashboard.tsx` — scope realtime listener, gate entrance-animation classes, bump debounce.

## Out of Scope (intentionally untouched)
- No changes to data shape, KPIs, layout, colors, or business logic.
- No schema changes, no edge-function changes.
- Admin dashboard and other pages are not modified.
- The existing `ClientNoticeBanner` and `SpendTrendChart` keep their own logic.

## Expected Result
- The client dashboard stops flickering/reloading during agency syncs.
- Numbers update smoothly in place when this client's own data changes.
- First page load still shows the premium skeleton + entrance animation exactly as today.
