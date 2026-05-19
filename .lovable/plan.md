# Fix the preview reload loop

## Root cause (confirmed)

The Lovable preview iframe periodically re-points its `src` to `/` (HMR restarts, parent rebuilds, console "server connection lost" — visible in your logs: `[vite] server connection lost. Polling for restart...`). Each time that happens:

1. The iframe loads `/`
2. `SmartHome` sees an authenticated admin and `<Navigate>`s to `/admin`
3. You land on the dashboard regardless of where you were

We can't stop the iframe reload itself (that's the Lovable dev harness), but we can make it **invisible**: remember the last route you were on and bounce there instead of always to `/admin`.

## Plan

### 1. Remember the last visited admin route
Add a tiny `useEffect` in `AdminLayout` (and `ClientLayout` / `ManagerLayout` / `PlatformLayout` for parity) that writes `location.pathname + search` to `sessionStorage` (key `hept:last-route`) on every navigation. `sessionStorage` survives an iframe reload within the same tab.

### 2. Make `SmartHome` (root `/`) restore that route
In `src/pages/Index.tsx` (the `SmartHome` component that currently always sends admins to `/admin`):
- If `sessionStorage["hept:last-route"]` exists and matches the user's role prefix (`/admin/*` for admin, `/dashboard/*` for client, etc.), `<Navigate>` there instead of the role's home.
- Otherwise fall back to current behavior (`/admin`, `/dashboard`, `/manager`, `/platform`).

Net effect: when the preview reloads to `/`, you instantly snap back to whatever page you were on (Finance, AI Copilot, Clients, etc.) instead of bouncing to the dashboard.

### 3. Silence the Vite "server connection lost" reload churn (preview only)
The Vite HMR client triggers a full reload whenever the dev WS reconnects after a long gap. In `vite.config.ts` we can set `server.hmr.overlay = false` and add a tiny client-side guard in `main.tsx` that, when running inside the Lovable preview iframe (`window.parent !== window` and host matches `*.lovable.app`), debounces the visibility-change handler that triggers Vite's auto-refresh. This won't eliminate the iframe `src` reset, but it cuts the *additional* flashes caused by HMR reconnects when you tab away and back.

### 4. Diagnostic confirmation
Keep the existing `[App] mounted (nav type: ...)` log in `main.tsx` so we can verify after the fix that:
- Reload still happens (`nav type: reload`) but
- You land on the route you were on, not `/admin`

## Files to change

- `src/pages/Index.tsx` — read `sessionStorage["hept:last-route"]` in `SmartHome` before defaulting to role home
- `src/components/AdminLayout.tsx` — write current path to `sessionStorage` on route change
- `src/components/ClientLayout.tsx` — same
- `src/components/ManagerLayout.tsx` — same
- `src/components/PlatformLayout.tsx` — same
- `vite.config.ts` — disable HMR error overlay in preview
- `src/main.tsx` — small visibility-change debounce when running inside the preview iframe

## Out of scope

- The iframe `src` reset itself is controlled by the Lovable harness and can't be patched from app code.
- Production (`hept.lovable.app`, `heptbd.com`) is unaffected by this loop; these changes are safe there too and just add nicer "resume where you left off" behavior.

Approve and I'll implement.