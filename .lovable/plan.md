## Goal
Stop the app from repeatedly bouncing protected pages through the login screen, which looks like a full page reload with a white flash and sidebar remount.

## What I found
- The preview/session replay shows `/admin` rendering, then the app falls back to the login screen.
- Console shows `[Auth] Safety timeout: forcing authReady`.
- In `useAuth.tsx`, the provider can force `authReady=true` after 5s even when session resolution is still incomplete.
- In `ProtectedRoute.tsx`, once `authReady` becomes true, `!user` immediately redirects to `/login`.
- That means a slow or delayed auth restore becomes a redirect loop: protected page -> forced auth ready -> login -> auth resumes -> route remount -> repeat.
- The earlier service worker fix was good, but the current bug is primarily an auth state race.

## Plan
1. Harden auth bootstrapping in `src/hooks/useAuth.tsx`
- Replace the current timeout-based “force ready” behavior with a two-phase auth initialization flow.
- Track whether the initial auth check has actually completed before allowing the app to treat auth as settled.
- Prevent stale async role fetches from mutating state after a newer auth event.
- Only mark `authReady` after one of these is true:
  - an actual auth event resolved the session, or
  - `getSession()` returned definitively with no session.

2. Make protected routes resilient in `src/components/ProtectedRoute.tsx`
- Stop redirecting to `/login` while auth is still in an indeterminate restore state.
- Add a small “restoring session” hold state so temporary auth lag does not trigger a route bounce.
- Keep role/org checks behind authenticated state only, so org fetches never race against a missing session.

3. Tighten login redirect behavior in `src/pages/Login.tsx` and app shell routing
- Ensure the login page only redirects after both user and role are truly stable.
- Remove any path where `/login` can briefly render during an in-progress session restore for already signed-in users.
- Verify root/app-shell logic does not choose an anonymous fast path when a valid session token exists but auth hydration is still pending.

4. Add targeted diagnostics for verification
- Keep lightweight dev-only logs around auth phase transitions so we can confirm the loop is gone.
- Verify that idle time on `/admin`, `/dashboard`, `/manager`, and `/platform` no longer causes route remounts or document-level flashes.

## Technical details
Files to update:
- `src/hooks/useAuth.tsx`
- `src/components/ProtectedRoute.tsx`
- `src/pages/Login.tsx`
- `src/App.tsx` if the shell needs a small guard adjustment

Expected result:
- No repeated jump from protected pages to `/login`
- No visible white-flash “reload” every few seconds
- Sidebar/layout stays mounted while idle
- Auth restore is stable across all roles

## Validation
- Reproduce on `/admin`
- Confirm no repeated auth timeout warnings leading to redirects
- Confirm protected pages remain stable for an idle observation window
- Confirm signed-out users still correctly land on `/login`