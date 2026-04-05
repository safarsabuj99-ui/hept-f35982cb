

## Fix: Page Reload Redirects to Dashboard

### Root Cause

There's a race condition in `useAuth.tsx` between two concurrent calls to `fetchRole`:

1. `onAuthStateChange` fires first on reload → sets `user` → triggers the `useEffect` on `user?.id` → calls `fetchRole(userId)` (starts fetching)
2. `getSession()` resolves shortly after → also calls `await fetchRole(userId)` — but the **dedup guard** (`if (roleFetchRef.current === userId) return`) makes it **return immediately without awaiting** the in-flight fetch
3. `setLoading(false)` runs right after — but `role` is still `null` because the first fetch hasn't completed

With `loading=false`, `user` set, and `role=null`, `ProtectedRoute` evaluates `role !== requiredRole` → true → redirects to `/login`. Login then sees user+role (once the fetch completes) and redirects to the role's home page (e.g., `/admin`), losing the original URL.

### Fix

**File: `src/hooks/useAuth.tsx`**

Remove the dedup guard in `fetchRole` and instead use a single controlled flow:

- Remove `roleFetchRef` dedup logic that causes the early return
- Only set `loading=false` once — after `getSession` completes **and** role is fetched
- Remove the secondary `useEffect` on `user?.id` that races with `getSession`. Instead, handle role fetching from `onAuthStateChange` only for **subsequent** auth changes (sign-in/sign-out after initial load), not during the initial mount

The key change:
```
// getSession path (initial load): fetch role, THEN set loading=false
// onAuthStateChange: only fetch role for post-mount events (sign-in)
```

This ensures `loading` stays `true` until `role` is fully resolved, so `ProtectedRoute` keeps showing the spinner instead of redirecting.

### Files Changed (1 file)

| File | Change |
|------|--------|
| `src/hooks/useAuth.tsx` | Fix race condition: remove dedup guard, single loading=false path, prevent premature role-less redirect |

