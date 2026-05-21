## Plan

1. Harden preview reload recovery at the router level
- Replace the current last-route persistence from `sessionStorage` to `localStorage` so route recovery survives preview iframe recreation.
- Store the last valid in-app route per role and restore it only when it matches the authenticated user’s role scope.
- Make `/` restoration prefer the saved deep route over the generic role home (`/admin`, `/manager`, etc.).

2. Prevent false “new session” behavior during auth rehydration
- Tighten the auth bootstrap flow so transient restore states do not look like a sign-out/sign-in cycle.
- Ensure protected routes keep showing a stable loading shell while a valid stored auth token exists and role/profile fetch is still resolving.
- Avoid any unnecessary redirect back to `/admin` when auth is ready but role/home restoration has not finished yet.

3. Remove preview-only service worker interference
- Further disable push/service-worker behavior on Lovable preview hosts so preview iframe reloads cannot be amplified by stale worker registration or activation.
- Keep service worker support only for real top-level/non-preview environments.

4. Verify the actual failure path in preview
- Re-test the flow that currently reproduces the bug: open an inner page, wait 2–3 seconds, observe preview reload, confirm it returns to the same route instead of `/admin`.
- Confirm the reload no longer looks like a fresh session and that navigation state is preserved across repeated preview reloads.

## Technical details
- Files likely involved: `src/App.tsx`, `src/hooks/useAuth.tsx`, `src/components/ProtectedRoute.tsx`, `src/hooks/usePushNotifications.tsx`.
- Main bug already identified: the existing route restore uses `sessionStorage`, which is lost when the Lovable preview iframe is recreated, so the app falls back to role home after every preview reload.
- Secondary hardening: preview-only push/service-worker logic and auth restore sequencing to eliminate false session resets.

## Result
After the fix, a Lovable preview reload should no longer bounce users to `/admin` or feel like a new session; it should reopen the same page they were on.