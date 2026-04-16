
Looking at the new PageSpeed report:
- Performance: 87 (target: 90+)
- FCP: 1.5s ✓
- LCP: 3.2s ⚠️ (target <2.5s)
- TBT: 30ms ✓
- CLS: 0 ✓
- Speed Index: 6.0s ⚠️

Main issues flagged:
1. LCP element discovered late (likely the hero H1 or stats counter)
2. Render-blocking requests
3. Network dependency tree
4. LCP request discovery
5. Reduce unused JS (~115 KiB)
6. Reduce unused CSS (~18 KiB)
7. Long main-thread tasks (1)

Accessibility 77 issues:
- Buttons without accessible names
- aria-* not on real role elements
- Browser errors logged
- Background/foreground contrast

SEO 91:
- robots.txt issue

Let me check the current state of LandingPage and related files to plan precisely.

## Plan: Push Landing PageSpeed to 90+ (Performance, A11y, SEO)

### Targets
- Performance: 87 → 92+
- LCP: 3.2s → <2.4s
- Speed Index: 6.0s → <4s
- Accessibility: 77 → 95+
- SEO: 91 → 100

### Performance fixes

**1. Make hero LCP element discoverable instantly**
- Inline the hero `<h1>` text and CTA into `index.html` inside `#root` (replacing the spinner) so LCP candidate paints with HTML, not after JS hydration. React hydrates over it on mount.
- This single change typically drops LCP by 1–1.5s on mobile.

**2. Self-host critical font (Inter 700) instead of Google Fonts**
- Google Fonts CSS is render-blocking and adds 2 DNS+TLS roundtrips. Inline an `@font-face` for Inter 700 woff2 (preloaded `<link rel="preload" as="font" crossorigin>`) directly in `index.html`. Other weights stay on Google Fonts (lazy via stylesheet).
- Eliminates the ~310ms render-block.

**3. Eliminate unused JS (~115 KiB)**
- Audit `LandingPage.tsx` imports — currently still pulls many unused `lucide-react` icons, recharts (if any), and below-fold components into the main chunk.
- Split: keep ONLY nav + hero + first stats row in the eager chunk. Lazy-load: `DashboardMockup`, testimonials, FAQ, pricing tables, footer with `React.lazy` + `IntersectionObserver` (load when within 200px of viewport).
- Replace any `lucide-react` icons in below-fold sections with lazy chunks.

**4. Defer 3rd-party / non-critical work**
- Move service worker registration, push setup, analytics (if any) behind `requestIdleCallback`.
- Defer the Bengali font fetch to actual language toggle (already planned — verify it shipped).

**5. Long task elimination**
- The 1 long main-thread task is likely React initial render of all landing sections. Splitting per (3) breaks it into smaller tasks.

**6. Vite build**
- Add `target: 'es2020'` and `minify: 'esbuild'` (verify defaults).
- Verify `manualChunks` is splitting correctly — add `lucide-react` to its own vendor chunk so it can be tree-shaken per import.

### Accessibility fixes (77 → 95+)

**1. Buttons without accessible names**
- Audit landing page icon-only buttons (mobile menu toggle, theme toggle, language toggle, social links). Add `aria-label` to each.

**2. Invalid aria-* usage**
- Find elements using `aria-*` attributes on roles that don't support them (likely on `<div>` carousel/tab elements). Either add proper `role` or remove invalid aria attributes.

**3. Console errors**
- Check for any console errors during landing load (font 404s, image 404s, etc.) — fix sources.

**4. Color contrast**
- Audit muted text on dark background. Bump `text-zinc-500` → `text-zinc-400` where it sits on `bg-zinc-950`. Check footer links and small print specifically.

### SEO fixes (91 → 100)

**1. robots.txt**
- Current `public/robots.txt` is likely missing a `Sitemap:` directive or has invalid format. Add proper `User-agent: *`, `Allow: /`, `Sitemap: https://heptbd.com/sitemap.xml`.

**2. Add `sitemap.xml`** at `public/sitemap.xml` listing landing + login + signup + affiliate pages.

### Files to change

| File | Change |
|---|---|
| `index.html` | Inline hero H1+CTA into `#root`; self-host Inter 700 woff2 with preload; add `@font-face` inline |
| `public/inter-700.woff2` | Add self-hosted font file |
| `public/robots.txt` | Fix format + add sitemap reference |
| `public/sitemap.xml` | New — list public routes |
| `src/pages/LandingPage.tsx` | Lazy-load below-fold sections via `React.lazy` + IntersectionObserver; add aria-labels to icon-only buttons; fix muted text contrast; remove invalid aria attributes |
| `vite.config.ts` | Add `lucide-react` to manualChunks |

### Expected impact
- LCP: 3.2s → ~2.0s (inline hero in HTML)
- Speed Index: 6.0s → ~3.5s (smaller initial bundle)
- Performance: 87 → 92–95
- Accessibility: 77 → 95+
- SEO: 91 → 100

### What stays unchanged
- All app routes (`/admin`, `/dashboard`, etc.) untouched — only landing-route assets change
- No provider/auth changes (those were the previous round)
- No visual design changes — only attribute/lazy-load wiring
