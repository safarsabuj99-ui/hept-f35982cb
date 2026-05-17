## What I found

Searched every reload trigger in the codebase. There is **no `window.location.reload()`, no `<meta http-equiv="refresh">`, no `navigate(0)`, and no `controllerchange` listener** anywhere. So the reload is being caused indirectly. The 2 most plausible culprits, in order of likelihood:

### Culprit #1 — Service worker churn (most likely)
`public/sw.js` calls `self.skipWaiting()` on **every** install and `clients.claim()` on **every** activate. Lovable's edge serves `/sw.js` with `Cache-Control: no-cache`, so the browser re-validates it on every page load. Combined with PWA `display: standalone` in `manifest.json`, on some platforms (iOS PWA, certain Android Chrome builds) `clients.claim()` racing with an in-flight HTML request causes the browser to re-fetch the document — looking exactly like a full reload with white flash and sidebar re-render. The console even shows two `[Auth] Safety timeout` warnings ~90 s apart, which only fires once per AuthProvider mount — meaning the provider did remount between them.

### Culprit #2 — Aggressive query invalidation on auth events
`src/hooks/useAuth.tsx` calls `queryClient.invalidateQueries()` (no key — nukes the whole cache) on every `SIGNED_IN` event, and `queryClient.clear()` on `SIGNED_OUT`. If a TOKEN_REFRESHED is misclassified or the listener fires twice (which Supabase does fire `INITIAL_SESSION` + `SIGNED_IN` back-to-back on first load), the entire cache refetches and the screen flashes loaders — readable as "reload" to the user.

---

## Fix plan (frontend-only, no business logic touched)

### 1. Harden the service worker
Edit `public/sw.js`:
- Move `skipWaiting()` behind a `controller`-presence check so a fresh install on an uncontrolled page doesn't try to steal control mid-navigation.
- Keep `clients.claim()` but wrap it so it only runs when there is no existing controller — preventing the activation race that triggers reloads.
- Bump the version comment to `v3 — reload-loop fix` to force one final activation across already-installed clients.

### 2. Guard registration against iframe / preview hosts
Edit `src/hooks/usePushNotifications.ts` — the guard already checks `window.self === window.top`, but add a hostname check so the SW never registers on `*.lovableproject.com` or `id-preview--*`. This eliminates reload risk in the Lovable preview iframe entirely.

### 3. Stop the global cache nuke on SIGNED_IN
Edit `src/hooks/useAuth.tsx`:
- Remove the unconditional `queryClient.invalidateQueries()` on `SIGNED_IN`. The per-user `queryKey: [..., user?.id]` pattern already auto-invalidates when the user changes, so this is redundant and causes a refetch storm.
- Keep `queryClient.clear()` on `SIGNED_OUT` (correct behavior).
- Skip `fetchRole` if `INITIAL_SESSION` and `SIGNED_IN` fire back-to-back for the same user id (guard with a ref).

### 4. Add a one-time reload detector (diagnostic)
Add 4 lines in `src/main.tsx` that log to console whenever the page mounts, with a `performance.navigation.type` tag. If after the above fixes the user still sees flashes, we'll instantly know whether they're real reloads (`type: 'reload'` or `'navigate'`) or just re-renders.

---

## Out of scope
- No database changes
- No edge function changes
- No P&L / wallet / cash-flow logic touched
- No UI redesign

## Acceptance
- Open `/admin`, `/dashboard`, `/manager`, `/platform` and idle for 2 minutes → zero new document requests in Network tab.
- Console shows `[App] mounted (type: navigate)` exactly **once** per route entry.
- No more `[Auth] Safety timeout` warnings.
- Sidebar items don't pop in/out after the first 500 ms.

Approve and I'll implement all 4 steps in one pass.