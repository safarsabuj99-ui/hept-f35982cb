## Goal
Stop the Lovable preview from auto-reloading every 2–3 seconds on `/admin` without changing normal published-app behavior.

## Plan
1. **Make preview bootstrap fully passive**
   - Update preview detection and disable all service-worker interaction on Lovable preview/iframe hosts.
   - In preview, do not register a worker and do not call `getRegistrations()` / `unregister()` at startup, since even cleanup work can destabilize the iframe session.

2. **Harden auth and route guards against preview reconnects**
   - Tighten the auth restore path so a transient preview reconnect cannot look like a fresh app boot.
   - Prevent protected routes from bouncing between loader/redirect states while auth and role hydration are still settling.
   - Keep last-route restore logic, but ensure it never participates in a redirect loop during preview reconnects.

3. **Remove any preview-only full-page navigation risks**
   - Audit global startup hooks and notification/navigation helpers for anything that can cause a document navigation or repeated mount cycle in preview.
   - Gate any iframe-sensitive logic so preview stays SPA-only and passive while idle.

4. **Add short-lived diagnostics, then verify**
   - Add targeted preview-safe logging to distinguish:
     - real document reloads
     - route changes
     - auth-state transitions
     - Vite reconnects
   - Verify by leaving `/admin` open in Lovable preview and confirming the page no longer remounts every few seconds.
   - Remove or reduce diagnostics once the loop is confirmed fixed.

## Files likely involved
- `src/hooks/usePushNotifications.ts`
- `src/components/ProtectedRoute.tsx`
- `src/hooks/useAuth.tsx`
- `src/App.tsx`
- `src/main.tsx`
- potentially `src/hooks/useNotifications.tsx` if a global navigator side effect is contributing

## Technical notes
- Current evidence points more to a **preview transport / iframe-sensitive startup issue** than a true backend session loss:
  - preview console shows `server connection lost. Polling for restart...`
  - sandbox Vite logs do **not** show repeated server restarts
  - the earlier `localStorage` route fix addressed “new session after reload”, but not this separate auto-reload loop
- The implementation will focus on **preview-only safeguards** so production behavior remains unchanged.