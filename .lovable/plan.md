

## Make Client Notice Banner More Eye-Catching

The current notice banner is subtle — low-opacity backgrounds, small text, and minimal visual weight. The goal is to make it impossible to miss when a client opens their dashboard.

### Changes

**1. Redesign `ClientNoticeBanner` component** (`src/components/ClientNoticeBanner.tsx`)

- **Stronger backgrounds & borders**: Increase opacity from `/10` → `/20` for backgrounds, `/30` → `/50` for borders. Add `shadow-lg` with colored shadows per type.
- **Larger icon with colored bubble**: Wrap the icon in a rounded colored circle (like the sidebar icon bubbles) to create a visual anchor.
- **Bigger, bolder text**: Title bumped from `text-sm` → `text-base font-bold`, message from `text-xs` → `text-sm`.
- **Animated entry**: Add `animate-slide-up-fade` with stagger so banners cascade in.
- **Urgent type gets extra treatment**: Glowing border effect via `ring-2 ring-destructive/40`, stronger pulse, and a gradient left-accent bar.
- **Left accent stripe**: A 4px colored vertical bar on the left edge for all notice types for quick visual scanning.

**2. Add shimmer/glow keyframe** (`src/index.css`)

- Add a subtle `animate-attention-glow` keyframe that pulses the box-shadow for urgent notices, making them visually demand attention.

**3. Ensure banner is above the fold** (`src/pages/ClientDashboard.tsx`)

- Already positioned first — no change needed. Optionally add a small `scroll-mt-4` so it's never clipped.

### Summary of Visual Impact
- Info: Blue left bar + blue icon bubble + stronger blue tint
- Warning: Amber left bar + amber icon bubble + amber glow  
- Urgent: Red left bar + red icon bubble + pulsing red glow + ring highlight

