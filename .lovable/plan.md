

## iOS-Style Glassmorphism Overhaul for Landing Page

**Goal:** Replace the current flat/muted card styling with realistic iOS-style glass effects — layered translucency, subtle noise texture, luminous borders, and depth-creating blur layers.

### What makes iOS glass feel real
iOS glassmorphism uses multiple layers: a heavily blurred background, a subtle noise/grain texture overlay, thin luminous border highlights (brighter on top/left edges), and careful use of saturation-boosted backdrop filters. The current landing page uses basic `backdrop-blur(16px)` with `bg-card/0.6` — this lacks the noise, saturation boost, and multi-edge highlight that create the "real glass" illusion.

### Changes

#### 1. `src/index.css` — New glass utility classes

Add these new CSS utilities:

- **`.ios-glass`** — The core glass class: `backdrop-filter: blur(40px) saturate(180%);` with `bg-card/0.45` (dark) / `bg-card/0.55` (light), a subtle CSS noise texture via inline SVG `background-image`, and a `::before` pseudo-element creating a top-to-bottom luminous gradient border (bright white/5% on top edge fading to transparent).

- **`.ios-glass-nav`** — Navbar variant: thinner glass with `blur(24px) saturate(150%)`, `bg-background/0.72`, and a bottom `border-b` with subtle luminous edge. Higher opacity for readability.

- **`.ios-glass-card`** — Card variant: same as `.ios-glass` plus `box-shadow` with multiple layers (inner white glow + outer soft shadow) and `transition: box-shadow 0.3s`. Hover state adds a brighter glow.

- **`.ios-noise`** — Reusable noise overlay using an SVG `<filter>` turbulence pattern as a `background-image`, set to `opacity: 0.03` (light) / `0.06` (dark) with `pointer-events: none`.

#### 2. `src/pages/LandingPage.tsx` — Apply glass effects

- **Navbar (line 344):** Replace `bg-background/80 backdrop-blur-lg` with the new `ios-glass-nav` class.

- **Pain point cards (line 435):** Add `ios-glass` class to each `<Card>` in the problems section, replacing the plain `hover:shadow-lg` with the glass card styling.

- **Feature mockup cards (line 500):** Replace `bg-card border border-border rounded-xl shadow-lg` with `ios-glass-card` for the feature wireframe containers.

- **Stats cards (line 681):** Apply `ios-glass` to the impact/stats `<Card>` elements.

- **Testimonial cards (line 734):** Apply `ios-glass` to testimonial `<Card>` elements.

- **How It Works steps (line 706):** Wrap each step in an `ios-glass` container.

- **Before/After table (line 453):** Apply `ios-glass` to the comparison table container.

- **Hero badge (line 382):** Apply glass effect to the "Built for Media Buying Agencies" pill.

- **Dashboard mockup (line 228):** Apply `ios-glass-card` to the browser-chrome container with enhanced shadow layering for depth.

- **CTA section (line 783):** Add a glass overlay layer on the primary-colored CTA block.

#### 3. Dark mode tuning in `src/index.css`

- In `.dark`, glass backgrounds use lower opacity (`bg-card/0.35`) with higher blur (`blur(48px)`) and stronger saturation (`saturate(200%)`) for that deep iOS dark mode translucency.
- Noise texture opacity increases to `0.06` in dark mode for visible grain.
- Border highlights use `white/8%` instead of `white/5%` for better visibility against dark backgrounds.

### Technical details

- Noise texture is a pure CSS SVG data URI (no external files needed): `url("data:image/svg+xml,<svg ...><filter><feTurbulence .../></filter><rect .../></svg>")`
- `backdrop-filter: blur(40px) saturate(180%)` with `-webkit-backdrop-filter` prefix for Safari
- Multi-layer box shadows: `inset 0 1px 0 0 rgba(255,255,255,0.05), 0 4px 24px -4px rgba(0,0,0,0.12)`
- No external dependencies or images needed — pure CSS

### Files changed
- `src/index.css` — add `.ios-glass`, `.ios-glass-nav`, `.ios-glass-card`, `.ios-noise` utilities
- `src/pages/LandingPage.tsx` — apply new glass classes to all sections

