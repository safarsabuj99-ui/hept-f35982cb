

## Fix: Infinite Loading When Switching Browser Tabs

### Root Cause

Two compounding bugs cause the infinite spinner when returning to the tab:

1. **`useAuth` re-fetches role on every `TOKEN_REFRESHED` event.** When you switch tabs and come back, Supabase auto-refreshes the token, firing `TOKEN_REFRESHED` via `onAuthStateChange`. This creates a new `session` object reference, triggering downstream re-renders — even though the role never changes on a token refresh.

2. **`ProtectedRoute` re-runs the org status check on every `user`/`role` change.** The `useEffect` depends on `[user, role]`. When `onAuthStateChange` sets a new `user` object (same user, new reference), the effect fires again, setting `checkingOrg = true`, which shows the full-screen spinner. If the DB query is slow or the network hiccups, the user is stuck on a spinner indefinitely.

### Fix (2 files)

**`src/hooks/useAuth.tsx`**
- Skip `fetchRole` for `TOKEN_REFRESHED` events — the role doesn't change on token refresh, only the JWT does.
- Only call `fetchRole` on `SIGNED_IN`, `USER_UPDATED`, and `INITIAL_SESSION` events.
- This prevents unnecessary role queries and avoids creating new state references on tab-switch.

**`src/components/ProtectedRoute.tsx`**
- Track the user ID that was last checked for org status using a ref.
- Only re-run the org check if the actual `user.id` changes (not just the object reference).
- Once org status is fetched for a user, don't re-fetch on token refreshes.

### Technical Details

```text
Tab switch flow (BEFORE fix):
  Tab visible → Supabase refreshes token → TOKEN_REFRESHED event
  → setSession(newObj) + setUser(newObj) → fetchRole() fires
  → ProtectedRoute effect fires → checkingOrg=true → SPINNER
  → DB queries for role + org status → finally renders page

Tab switch flow (AFTER fix):
  Tab visible → Supabase refreshes token → TOKEN_REFRESHED event
  → setSession(newObj) + setUser(newObj) → fetchRole SKIPPED
  → ProtectedRoute: user.id unchanged → org check SKIPPED
  → No spinner, page stays rendered
```

### No Database Changes

