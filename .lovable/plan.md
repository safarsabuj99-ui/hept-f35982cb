# Why the preview keeps "reloading"

What you're seeing is **not a reload loop**. Every time the Lovable AI saves a file, Vite's dev server pushes an HMR update to the preview. For most of our files (AuthProvider, hooks, App.tsx imports, etc.) React Fast Refresh can't preserve state, so Vite does a **full page reload of the preview iframe**. That part is normal Vite behavior — it cannot be turned off without breaking hot reload.

What makes it *look like* a reload loop is what happens after each reload:

1. `AuthProvider` starts with `loading: true`, `authReady: false`.
2. `ProtectedRoute` sees `!authReady` → renders the **full-screen `Loader2` spinner** (the blue circle you see in the recording).
3. It waits for `supabase.auth.getSession()` + role fetch (~500-1500 ms on mobile).
4. Then the dashboard reappears.

So every AI edit = 1-2 seconds of full-screen blue spinner. The published site doesn't show this because no HMR fires there. That's why your answers — "only in Lovable preview, only while AI is editing" — match perfectly.

## Fix: hydrate auth synchronously, never show the full-screen spinner if a session already exists

We already store the Supabase session in `localStorage`. On mount we can read it synchronously and treat the user as authenticated immediately, then verify in the background. The spinner only shows on a true cold start with no token.

### Changes

**1. `src/hooks/useAuth.tsx`**
- Add a synchronous `readCachedSession()` helper that parses `sb-hhpiimnvkgmpfnldgdhc-auth-token` from `localStorage` (we already do this in `isSessionCorrupted`) and returns `{ user, expiresAt }` when the JWT is well-formed and unexpired.
- Initialize state from it:
  - `user` = cached user (or `null`)
  - `session` = `null` (real session arrives async, that's fine — nothing reads `session` synchronously)
  - `authReady` = `true` when a cached user exists, else `false`
  - `loading` = same logic
- Also cache `role` in `localStorage` (`hept:cached-role`) whenever `fetchRole` succeeds, and seed `role` from it on init. Role is read synchronously by `ProtectedRoute` to pick the home route.
- Background validation (`getSession()` + `fetchRole`) still runs and overwrites the cached values if they changed. The `onAuthStateChange` listener stays as-is.
- On `SIGNED_OUT`, clear the cached role key.

**2. `src/components/ProtectedRoute.tsx`**
- Replace the `!authReady || loading || checkingOrg` full-screen spinner with a render-children-optimistically pattern: if `user` is already present (from cache), render children immediately and let `checkingOrg` run silently in the background. Only show the full-screen spinner when there is **no cached user AND no token in localStorage** (true cold start).
- `checkingOrg` becomes a non-blocking effect — it still gates the suspended/pending-payment screens, but it no longer flashes the spinner on every HMR reload.

**3. `src/App.tsx` — `SmartHome`**
- Same treatment: if a cached user+role exists synchronously, redirect to their role home immediately instead of rendering `<PageLoader />`.

### Out of scope
- No changes to Vite config, HMR, or the service worker — the preview will still reload on each save, but it will be **invisible** (the dashboard stays on screen during the reload, then re-renders with the same data thanks to react-query cache).
- No changes to data fetching, RLS, or any UI other than the auth gate.
- Published-site behavior is unchanged (still cold-loads with spinner once on first visit, since the cache is empty then too — which is the correct UX).

### Why this is safe
- The cached user is only used for **UI gating**. Every Supabase query still re-validates the JWT on the server, so a stale/forged cache can't bypass RLS — it just lets the wrong UI flash for a few hundred ms before `getSession()` corrects it.
- If the cached JWT is expired or malformed, `isSessionCorrupted()` already wipes it (existing code), so we fall back to the cold-start spinner.
- Role caching is invalidated the moment `fetchRole` returns a different value, and cleared on `SIGNED_OUT`.

### Expected result
After AI saves a file: the preview iframe still reloads under the hood, but you'll see the dashboard the entire time — no blue spinner, no blank screen, no perceived "reload".
