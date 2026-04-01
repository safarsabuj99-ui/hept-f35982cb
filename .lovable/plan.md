

## Fix: Pages Redirect to Dashboard on Reload

### The Problem
When you reload any page (e.g., `/admin/finance`, `/admin/ad-accounts`), the app briefly thinks you're not logged in, redirects to `/login`, and then Login's useEffect sees you're authenticated and sends you to `/admin` (the dashboard) instead of back to the page you were on.

### Root Cause
In `useAuth.tsx`, the `onAuthStateChange` listener can fire with `null` session **before** `getSession()` resolves the actual session. When that happens, it sets `loading=false` with no user, which causes `ProtectedRoute` to redirect to `/login`. Then Login detects the user and redirects to the role's home page (`/admin`), losing the original URL.

### The Fix (2 files)

**1. `src/hooks/useAuth.tsx`** — Don't set `loading=false` prematurely in `onAuthStateChange`

Remove `setLoading(false)` from the no-session branch inside `onAuthStateChange`. Only `getSession()` should control the initial loading state. This ensures the app stays in "loading" mode until the session is fully resolved, preventing the false redirect to `/login`.

**2. `src/pages/Login.tsx`** — Redirect preserving the current URL isn't needed here since Login only fires when user lands on `/login`. No change needed if the auth fix works correctly.

### What Changes
- One line removed in `useAuth.tsx` (line 69: `setLoading(false)`)
- The loading spinner stays visible during reload until auth is confirmed
- Once auth resolves, ProtectedRoute allows through — user stays on their current page

