

## Plan: Optimize Landing Page — Mobile Text Overflow + Faster First Load

### Mobile Text Overflow Fixes

**File: `src/pages/LandingPage.tsx`**

1. **Before/After table (lines 349-363)** — On 390px, `grid-cols-2` with `px-6` padding causes text clipping. Fix: reduce padding to `px-3 sm:px-6` and add `min-w-0` + `break-words` on text cells.

2. **DashboardMockup KPI grid (line 118)** — `grid-cols-4` is too tight on mobile. Change to `grid-cols-2 sm:grid-cols-4` so KPIs stack into 2x2 on small screens.

3. **DashboardMockup bar chart container (line 117)** — Reduce padding from `p-6` to `p-3 sm:p-6` on mobile.

4. **Feature mockup grids (lines 410, 424, 483)** — The campaign table `grid-cols-[1fr_80px_60px]` and balance table `grid-cols-[1fr_70px_70px_70px]` overflow on mobile. Reduce fixed column widths: `grid-cols-[1fr_60px_50px]` and `grid-cols-[1fr_55px_55px_55px]` respectively.

5. **Platform badges (line 184)** — Add `justify-center` on mobile so they wrap cleanly centered.

6. **Hero heading (line 281)** — Reduce from `text-4xl` to `text-3xl sm:text-4xl` for mobile.

7. **Stats section values (line 581)** — `text-3xl sm:text-4xl` is fine but add `break-words` for Bangla text.

8. **Final CTA section (line 680)** — `p-12` is too wide for mobile. Change to `p-6 sm:p-12 lg:p-16`.

### Performance: Faster First Load

9. **Single shared IntersectionObserver** — Currently each `Reveal` component creates its own `IntersectionObserver`. Replace with a single shared observer pattern using a context/ref map. This eliminates ~20+ observer instances on page load.

10. **Memoize static sub-components** — Wrap `DashboardMockup` and `PlatformBadges` in `React.memo()` since they receive no changing props (or only `lang`). This prevents re-renders during scroll animations.

11. **Defer below-fold content with `content-visibility: auto`** — Add `content-visibility: auto` CSS to sections below the hero (#problems, #features, etc.) so the browser skips layout/paint for off-screen sections during initial load. This is a CSS-only optimization with major paint savings.

12. **LandingPage is already lazy-loaded** — confirmed in App.tsx (line 82). No change needed there.

### Files Changed
- `src/pages/LandingPage.tsx` — mobile overflow fixes, shared observer, memoized components
- `src/index.css` — add `content-visibility: auto` utility class

