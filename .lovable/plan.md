## Goal

Make the **mobile sidebar/nav drawer** (the panel in your second screenshot) feel like the same premium frosted glass surface as the global search dialog (first screenshot): heavier blur, more translucent, and slightly more compact.

Today the drawer is a solid `bg-sidebar` color with a flat `bg-black/80` overlay — it looks opaque and disconnected from the rest of the iOS/One UI glass language used everywhere else.

## Visual changes

| Aspect | Before | After |
|---|---|---|
| Drawer background | Solid `bg-sidebar` (opaque) | `hsl(var(--sidebar-background)/0.55)` + 48px blur, 200% saturation — true frosted glass like the search dialog |
| Right edge | Flat 1px border | Crisp inner-highlight (white-8%) + soft outer ambient shadow |
| Width | `18rem` (`SIDEBAR_WIDTH_MOBILE`) | `16.5rem` — slightly more compact, leaves more page peek-through |
| Page overlay | `bg-black/80` (heavy black) | `bg-background/40` + 8px backdrop-blur — softens the page behind without hiding it, matches dialog overlay |
| Header band | `bg-sidebar-background/0.6` + 12px blur | Bumped to 32px blur + saturate(180%) so the HEPT logo / version tag float on the same glass |
| Footer band | Standard | Same glass treatment as header for visual symmetry |
| Section dividers | Solid line | Slight reduction in opacity so they don't fight the glass |

## Implementation

### 1. `src/index.css` — new sidebar-glass tokens

Add a paired utility next to the existing `.sidebar-premium`:

```css
.sidebar-premium-glass {
  background: hsl(var(--sidebar-background) / 0.55);
  backdrop-filter: blur(48px) saturate(200%);
  -webkit-backdrop-filter: blur(48px) saturate(200%);
  border-right: 1px solid hsl(0 0% 100% / 0.08);
  box-shadow:
    inset -1px 0 0 0 hsl(0 0% 100% / 0.06),
    0 0 60px -10px hsl(var(--primary) / 0.25);
}
.dark .sidebar-premium-glass {
  background: hsl(var(--sidebar-background) / 0.45);
  border-right-color: hsl(0 0% 100% / 0.06);
  box-shadow:
    inset -1px 0 0 0 hsl(0 0% 100% / 0.05),
    0 0 80px -10px hsl(var(--primary) / 0.35);
}
```

Bump `.sidebar-header-premium` blur from `12px` → `32px` with `saturate(180%)` and lower the background alpha from `0.6` → `0.4` so the glass shows through.

### 2. `src/components/ui/sidebar.tsx` — apply only on mobile branch

Inside the `if (isMobile)` block (lines 153-171), update the `SheetContent`:

- Add the `sidebar-premium-glass` class (mobile-only — doesn't affect desktop sidebar).
- Drop `bg-sidebar` (replaced by the glass token).
- Tighten `SIDEBAR_WIDTH_MOBILE` for the mobile drawer to `16.5rem` via inline override (don't change the desktop constant).

```tsx
<SheetContent
  data-sidebar="sidebar"
  data-mobile="true"
  className="sidebar-premium-glass w-[--sidebar-width] p-0 text-sidebar-foreground [&>button]:hidden"
  style={{ "--sidebar-width": "16.5rem" } as React.CSSProperties}
  side={side}
>
```

### 3. `src/components/ui/sheet.tsx` — softer overlay (mobile drawer only)

Two safe options; I'll go with the targeted one to avoid touching every dialog/sheet in the app:

- Change `SheetOverlay` className from `bg-black/80` → `bg-background/40 backdrop-blur-sm`. This affects all Sheets, but currently the only mobile-open Sheet on small screens is the nav drawer + a few side panels that will benefit equally from the softer treatment, matching the dialog overlay style already in use elsewhere.

If a regression appears on any specific Sheet, we can override per-instance via `className` prop.

### 4. No JS / behavior changes

- Drawer open/close, swipe-to-dismiss, focus trap, route detection all unchanged.
- Desktop sidebar (≥ md) is untouched — it keeps the existing `.sidebar-premium` gradient look.

## Files to edit

- `src/index.css` — add `.sidebar-premium-glass` (light + dark), tweak `.sidebar-header-premium`
- `src/components/ui/sidebar.tsx` — apply glass class + tighter width on the mobile `SheetContent`
- `src/components/ui/sheet.tsx` — soften overlay to `bg-background/40 backdrop-blur-sm`

## Result

When you tap the hamburger on mobile, the nav drawer slides in as a translucent frosted panel — you'll see the dashboard glow softly behind it (especially the colored gradients on KPI cards), with the same depth/feel as the global search popover. It's also ~24px narrower for a more ergonomic, One UI 8.5–style float.