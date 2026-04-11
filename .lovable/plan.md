

## Fix: PWA Opens to Dashboard Instead of Landing Page

**Problem:** When the app is installed as a PWA and opened, it goes to the landing page (`/`) instead of the user's dashboard.

**Root cause:** The `manifest.json` has `"start_url": "/"`, which maps to `LandingPage`. Logged-in users should be redirected to their role-based dashboard.

**Solution — two changes:**

### 1. Update `manifest.json`
Change `start_url` from `"/"` to `"/login"`. The login page already redirects authenticated users to their dashboard.

### 2. Update the `/` route in `App.tsx`
Replace the static `<LandingPage />` with a smart redirect component that:
- If the user is **logged in** → redirects to their role-based dashboard (`/admin`, `/manager`, `/dashboard`, `/platform`)
- If the user is **not logged in** → shows the landing page as usual

This ensures that when the PWA opens, authenticated users go straight to their dashboard without seeing the landing page flash.

### Files changed
- `public/manifest.json` — update `start_url`
- `src/App.tsx` — add auth-aware root route logic

