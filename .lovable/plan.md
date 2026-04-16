
## Plan: Boost Landing Page Performance

### Issues found in PageSpeed report
1. **Render-blocking ~310 ms** — Google Fonts CSS link blocks paint despite the `media="print"` swap (parser still discovers it sync).
2. **Use efficient cache lifetimes (~250 KiB)** — static assets lack long cache headers (Lovable-managed; can't fully fix).
3. **Reduce unused JavaScript ~117 KiB / unused CSS ~18 KiB** — landing page bundle pulls in the entire React app (Auth, Branding, Currency providers, react-query, Toaster, Sonner, Tooltip, all routes).
4. **LCP delay** — 6+ blank/dark frames before hero appears because:
   - `App.tsx` boots `AuthProvider` → `BrandingProvider` → `CurrencyProvider` before Suspense fallback renders `LandingPage`.
   - Even unauthenticated visitors wait for Supabase `getSession()` to resolve before `SmartHome` returns `<LandingPage/>`.
5. **Forced reflow** — `getSharedObserver()` + 30+ Reveal wrappers on initial paint.

### Fix Plan

**1. Fast-path the landing route in `src/App.tsx`**
- Detect `pathname === "/"` AND no active session token in `localStorage` BEFORE mounting `AuthProvider`/`BrandingProvider`/`CurrencyProvider`.
- Render `<LandingPage/>` directly inside a minimal shell (just `BrowserRouter` + `Suspense`). Skip QueryClient, Toaster, Sonner, Tooltip, Auth bootstrap entirely.
- Auth + providers only mount when navigating to an app route.

**2. Eager-import the Landing page**
- Change `const LandingPage = lazy(() => import(...))` to a static import. Removes the extra chunk roundtrip (currently 2 sequential network hops: `index.html` → `App` chunk → `LandingPage` chunk).

**3. Inline critical hero CSS in `index.html`**
- Add minimal CSS for nav + hero (background, font, hero text sizing) inside `<style>` so first paint shows hero text without waiting for `index.css` (~973 lines).

**4. Defer Google Fonts properly**
- Replace `<link media="print" onload>` trick with `rel="preload" as="style"` + onload swap. Add `font-display: swap` reliance (already in URL).
- Drop `Noto Sans Bengali` from initial load — only fetch when user toggles to BN. Saves a font family on first paint.
- Drop `JetBrains Mono` from landing — not used in landing hero.

**5. Slim the landing component**
- Replace `lucide-react` named imports (~30) with only those used in above-fold (hero). Lazy-load the rest of the page (testimonials, FAQ, dashboard mockup) using `React.lazy` + `Suspense` so initial LCP only ships nav + hero.
- Wrap `DashboardMockup` in `React.lazy` — it's heavy and below-fold.
- Reduce Reveal wrappers' initial work: skip IntersectionObserver setup until after first paint (`requestIdleCallback`).

**6. Vite build optimization (`vite.config.ts`)**
- Add `build.rollupOptions.output.manualChunks` to split:
  - `react-vendor` (react, react-dom, react-router-dom)
  - `ui-vendor` (radix, lucide-react)
  - `supabase` (only loaded with auth)
- Add `build.cssCodeSplit: true` (default already, verify).

**7. Service worker**
- Already minimal (no caching). Keep as-is, but defer registration until after landing first paint (it currently only registers in `usePushNotifications` which is fine).

### Files to change
| File | Change |
|---|---|
| `index.html` | Inline critical hero CSS, fix font preload, drop unused fonts from initial load |
| `src/App.tsx` | Fast-path `/` route — render LandingPage without Auth/Branding/Currency/Query providers; eager-import LandingPage |
| `src/pages/LandingPage.tsx` | Lazy-load below-fold sections (DashboardMockup, testimonials, FAQ); defer IntersectionObserver setup; load Bengali font on demand |
| `vite.config.ts` | Add `manualChunks` for vendor splitting |

### Expected impact
- LCP: ~3 dark frames → ~1 frame (eliminate Auth bootstrap wait).
- Initial JS: −80 to −120 KiB (no Supabase/react-query/Auth on landing).
- Render-blocking: −310 ms (proper font preload + inlined critical CSS).
- TBT: lower (smaller main bundle + deferred observers).
