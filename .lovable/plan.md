

## Fix: Data Not Loading After Login (Auth Race Condition)

### Root Cause

When you log in, here's what happens:

1. `signIn()` completes and triggers `onAuthStateChange`
2. The app navigates to `/admin` (or other dashboard)
3. Dashboard queries (`useAdminDashboardData`, `usePendingCounts`, etc.) fire **immediately**
4. But `fetchRole()` is still running — and more critically, the Supabase session token may not be fully propagated yet
5. Queries hit the database with no valid auth token → RLS blocks them → **empty results get cached**
6. React Query caches these empty results for 60 seconds, so the dashboard stays blank
7. Manual browser reload works because the session is already stored in `localStorage` by then

The auth logs confirm this: repeated "missing sub claim" / `bad_jwt` errors from `client-spend-hub.lovable.app`.

### Solution: Gate All Authenticated Queries on Auth Readiness

**1. Add `session` to the `useAuth` context export** (already available internally, just needs to be used)

No change needed — `session` is already exposed via `useAuth()`.

**2. Gate `useAdminDashboardData` on auth session** (`src/hooks/useAdminDashboardData.ts`)

Add `enabled: !!session` to the query options. Import and use `useAuth()` to get the session. This prevents the query from firing before the auth token is ready.

**3. Gate `usePendingCounts` on auth session** (`src/hooks/usePendingCounts.tsx`)

Same pattern — add `useAuth()` and `enabled: !!user` to prevent unauthenticated queries.

**4. Invalidate stale caches on login** (`src/hooks/useAuth.tsx`)

In the `onAuthStateChange` handler, when a `SIGNED_IN` event fires after initialization, call `queryClient.invalidateQueries()` to clear any stale/empty cached results from before auth was ready. This requires importing `useQueryClient`.

**5. Gate page-level queries in major dashboard pages**

Several pages (e.g., platform pages like `PlatformChurnPrediction`, `PlatformFeatureAdoption`, `PlatformHealthScores`, etc.) also have ungated queries. Since these are behind `ProtectedRoute`, they're less likely to hit the race condition, but for robustness we'll add `enabled: !!user` where missing.

### Files Modified

- `src/hooks/useAdminDashboardData.ts` — add `enabled: !!session`
- `src/hooks/usePendingCounts.tsx` — add `enabled: !!user`
- `src/hooks/useAuth.tsx` — invalidate all queries on `SIGNED_IN` event
- `src/pages/Login.tsx` — no changes needed (already watches `user && role`)

### Why This Works

- Queries won't fire until the auth token is valid → no empty cached results
- On login, stale caches are cleared → fresh data loads immediately
- No changes to routing, layouts, or existing components → zero risk of side effects
- Manual reload behavior is preserved since session is already in localStorage

