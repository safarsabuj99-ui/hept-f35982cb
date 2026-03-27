

## Three Fixes: Mobile Modal, Page Reload Redirect, Theme Persistence

### 1. Optimize Confirm Approval Modal for Mobile

**Problem**: The `DialogContent` in `PaymentRequests.tsx` (line 524) has no height constraint or scroll handling. On mobile (390px viewport), the modal content (client info + rate selection + account selector + note + footer buttons) overflows the screen, pushing "Yes, Approve" and "Cancel" buttons off-screen.

**Fix in `src/pages/PaymentRequests.tsx`**:
- Add `max-h-[85dvh]` and `overflow-hidden` to `DialogContent`
- Wrap the modal body (lines 540-649) in a scrollable `div` with `overflow-y-auto` and bottom padding (`pb-24 sm:pb-4`) to ensure content is scrollable above the sticky footer
- Make `DialogFooter` sticky at the bottom with `sticky bottom-0 bg-background border-t p-4 z-10` so buttons are always visible

### 2. Fix Page Reload Redirecting to Dashboard

**Problem**: When you reload `/admin/payment-requests`, the auth state is loading (`loading=true`), then resolves. But `ProtectedRoute` works correctly — the issue is in `useAuth.tsx`: `fetchRole` is called via `setTimeout(..., 0)` (line 55), so there's a brief moment where `user` is set but `role` is still `null`. `ProtectedRoute` line 30 sees `role !== requiredRole` (null !== "admin") and redirects to `/login`.

**Fix in `src/hooks/useAuth.tsx`**:
- Don't set `loading = false` until role has been fetched. Move `setLoading(false)` inside the role fetch completion, not immediately after session resolves.
- Remove the `setTimeout` wrapper around `fetchRole` — use direct `await` instead, and only set `setLoading(false)` after role is resolved.

```typescript
async (_event, session) => {
  setSession(session);
  setUser(session?.user ?? null);
  if (session?.user) {
    await fetchRole(session.user.id);
  } else {
    setRole(null);
  }
  setLoading(false);
}
```

### 3. Fix Theme Resetting on Reload

**Problem**: In `ThemeToggle.tsx`, two `useEffect` hooks run in order. The first (line 13) fires on `dark` state change and writes to localStorage. The second (line 22) reads from localStorage on mount. But the initial `useState` (line 6) reads from the DOM class — and `main.tsx` only adds `dark` class if there's NO localStorage entry. On reload with `theme=dark` in localStorage, the DOM already has `dark` class from `main.tsx`, so initial state is `true` — this works. But for `theme=light`: `main.tsx` doesn't add `dark`, initial state becomes `false`, first effect runs and sets `theme=light` — this also works.

The actual bug: the first `useEffect` runs BEFORE the second one completes. Initial state reads DOM class (`dark` if no localStorage). Then effect 1 writes `dark` to localStorage. Then effect 2 reads localStorage and gets `dark`. So if user set light mode, on reload: `main.tsx` doesn't add dark class → initial state = `false` → effect 1 writes `light` → effect 2 reads `light` → stays light. This should work...

Let me re-check: `main.tsx` line 6: `if (!localStorage.getItem("theme"))` add dark. So if localStorage has "light", no dark class is added. Initial state reads DOM = no dark class = `false`. Effect 1 writes "light". Effect 2 reads "light", sets `false`. Seems fine.

Wait — the real issue is likely that the `useState` initializer checks `document.documentElement.classList.contains("dark")`. On reload, `main.tsx` runs first and adds `dark` only if NO localStorage entry. If localStorage has "dark", `main.tsx` does NOT add the class. So initial state = `false` (no class), effect 1 removes dark and writes "light" — **overwriting the user's "dark" preference!**

**Root cause confirmed**: `main.tsx` only adds `dark` class when there's no localStorage entry. But if localStorage has `"dark"`, `main.tsx` doesn't add the class → `ThemeToggle` initial state reads `false` → effect writes `"light"` → theme resets.

**Fix in `src/main.tsx`**:
```typescript
const stored = localStorage.getItem("theme");
if (stored === "light") {
  document.documentElement.classList.remove("dark");
} else {
  document.documentElement.classList.add("dark");
  if (!stored) localStorage.setItem("theme", "dark");
}
```

**Fix in `src/components/ThemeToggle.tsx`**: Simplify to single effect, read from localStorage as source of truth:
```typescript
const [dark, setDark] = useState(() => {
  const stored = localStorage.getItem("theme");
  return stored !== "light"; // default dark
});

useEffect(() => {
  document.documentElement.classList.toggle("dark", dark);
  localStorage.setItem("theme", dark ? "dark" : "light");
}, [dark]);
```

### Files Changed
- **`src/pages/PaymentRequests.tsx`** — Scrollable modal body + sticky footer
- **`src/hooks/useAuth.tsx`** — Await role fetch before setting loading=false
- **`src/main.tsx`** — Apply stored theme correctly on boot
- **`src/components/ThemeToggle.tsx`** — Single-effect, localStorage-first approach

