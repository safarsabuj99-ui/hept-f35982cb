
I found the most likely root cause and it is not just one small bug.

What is going wrong:
- The auth bootstrap is fragile in `src/hooks/useAuth.tsx`.
- It currently calls `getSession()` first and only then subscribes to auth changes. That can create timing issues during login/session restore.
- It also `await`s async work inside `onAuthStateChange`, which is a known source of auth timing problems.
- Many providers and dashboard widgets start querying as soon as `user` exists, instead of waiting until auth is fully ready and the session token is stable.
- Several of those fetches silently ignore auth/RLS errors and store empty state, so the page looks “loaded” but data is missing until a manual browser reload.
- Your backend logs already show repeated `bad_jwt` / `invalid claim: missing sub claim` errors on `/user`, which strongly suggests a stale/corrupted stored session sometimes survives in browser storage. That explains why clearing browser data sometimes fixes it.

So this is mainly:
1. auth race condition
2. invalid persisted session recovery not handled
3. early protected queries caching empty/failed results

Implementation plan:

1. Harden the auth lifecycle in `src/hooks/useAuth.tsx`
- Register `onAuthStateChange` before `getSession()`.
- Remove awaited async work from the auth callback.
- Split auth into clear phases: `authReady`, `session`, `user`, `role`, `roleLoading`.
- Add guarded role fetching with request tracking so older async results cannot overwrite newer auth state.
- Add invalid-session recovery: if restored session is malformed or user/session data is inconsistent, clear local auth state cleanly instead of leaving the app stuck.

2. Upgrade route gating in `src/components/ProtectedRoute.tsx` and `src/pages/Login.tsx`
- Only allow protected content to mount after auth is fully ready and the role check is complete.
- Prevent redirect loops or partial navigation during login.
- Keep login success flow waiting for stable auth state instead of navigating while queries are still racing.

3. Create a single “safe auth-ready” pattern and apply it to global providers
- Update these to wait for stable auth before querying:
  - `src/hooks/useBranding.tsx`
  - `src/hooks/useProfile.tsx`
  - `src/hooks/usePermissions.tsx`
  - `src/hooks/useOrgFeatures.ts`
  - `src/hooks/usePendingCounts.tsx`
  - `src/hooks/useNotifications.tsx`
  - `src/hooks/usePushNotifications.ts`
- Use `enabled: authReady && !!session?.user?.id` or equivalent guarded effects.
- Reset state on logout so stale data from the previous session cannot leak.

4. Fix dashboard/query timing where data currently loads too early
- Gate `src/hooks/useAdminDashboardData.ts` on full auth readiness, not only `!!session`.
- Audit and patch admin widgets that use immediate `useEffect` fetches so they do not fire before auth is ready:
  - `src/components/ProfitLossWidget.tsx`
  - `src/components/SpendTrendChart.tsx`
  - `src/components/dashboard/RevenueVsCostChart.tsx`
  - `src/components/dashboard/RecentActivityFeed.tsx`
  - `src/components/dashboard/ProfitabilityTable.tsx`
  - `src/components/RunwayPrediction.tsx`
  - plus the data widgets inside `AttentionPanel`
- Where possible, normalize these to React Query or at least add auth gating + explicit error handling.

5. Add smarter stale-session cleanup
- When a broken stored session is detected, perform a controlled local sign-out and clear the bad auth storage instead of forcing the user into endless reload states.
- This should eliminate the “works only after clearing cookies/storage” behavior.
- I will keep this scoped to auth storage only, so it does not wipe unrelated app settings like theme/preferences.

6. Improve resilience after sign-in/sign-out
- Invalidate/remove sensitive cached queries on auth transitions.
- Ensure user-scoped queries include user identifiers in keys where needed.
- Prevent empty unauthenticated responses from being reused after login.

7. Verification after implementation
- Fresh login from `/login` → dashboard loads data on first try
- Hard refresh on `/admin` with existing session → no blank widgets
- Sign out then sign in with another account → no stale old data
- Background tab/token refresh → no stuck reload state
- Broken stored session case → user is cleanly recovered instead of needing manual browser cleanup

Files I expect to change:
- `src/hooks/useAuth.tsx`
- `src/components/ProtectedRoute.tsx`
- `src/pages/Login.tsx`
- `src/hooks/useBranding.tsx`
- `src/hooks/useProfile.tsx`
- `src/hooks/usePermissions.tsx`
- `src/hooks/useOrgFeatures.ts`
- `src/hooks/usePendingCounts.tsx`
- `src/hooks/useNotifications.tsx`
- `src/hooks/usePushNotifications.ts`
- `src/hooks/useAdminDashboardData.ts`
- affected dashboard widget files listed above

Technical summary:
- This does not look like a database schema problem.
- It looks like a frontend auth/session orchestration problem plus weak recovery from invalid persisted auth state.
- The fix should be done centrally first in auth, then applied to early-loading queries so the whole app becomes stable instead of patching one page only.
