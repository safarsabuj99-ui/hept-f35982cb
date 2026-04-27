## Goal

Upgrade the bottom mobile search pills (per-page `MobileSearchPill` and global `MobileGlobalSearchPill`) to match the **reference frosted-glass aesthetic** in the screenshot: heavier blur, premium inner highlight, ambient glow border, and a slightly more compact footprint.

Both pills currently use plain `bg-card/95 backdrop-blur-2xl` with a flat shadow — they don't feel like part of the same design language as the global search dialog and the One UI side drawer. We'll align them with the existing `ios-glass-*` tokens that already power those surfaces.

## Visual changes

| Aspect | Before | After |
|---|---|---|
| Background | `bg-card/95` (almost opaque) | `hsl(var(--card)/0.55)` — true frosted glass, lets dashboard show through |
| Blur | `backdrop-blur-2xl` (~40px, no saturation) | `blur(48px) saturate(200%)` — matches `.ios-glass-card` |
| Border | `border-border/60` (flat) | `1px hsl(0 0% 100% / 0.1)` + inner `0.5px` micro-edge |
| Highlight | none | Top inner `1px` white-8% specular highlight (matches reference) |
| Shadow | Single primary-tinted drop shadow | Layered: deep ambient shadow + soft primary glow + top-edge bleed |
| Width | `max-w-sm` (384px) | `max-w-[340px]` — more compact, floats nicer at 390px viewport |
| Height | `h-12` (48px) | `h-11` (44px) — tighter, matches iOS/One UI pill height |
| Padding | `px-3` / `px-4` | `px-4` consistent with rounded-full radius |
| Results panel | Same pill bg | Promoted to `.ios-glass-card` look so it visually matches the global search dialog in the reference |

## Implementation

### 1. New utility class in `src/index.css`

Add `.ios-glass-pill-floating` (and a `.dark` override) — a stronger variant of `.ios-glass-pill` tuned specifically for floating bottom pills, with the ambient primary glow seen in the reference:

```css
.ios-glass-pill-floating {
  background: hsl(var(--card) / 0.55);
  backdrop-filter: blur(48px) saturate(200%);
  -webkit-backdrop-filter: blur(48px) saturate(200%);
  border: 1px solid hsl(0 0% 100% / 0.1);
  box-shadow:
    inset 0 1px 0 0 hsl(0 0% 100% / 0.1),
    inset 0 0 0 0.5px hsl(0 0% 100% / 0.04),
    0 12px 40px -10px hsl(var(--primary) / 0.28),
    0 4px 16px -4px hsl(0 0% 0% / 0.35);
}
.dark .ios-glass-pill-floating {
  background: hsl(var(--card) / 0.4);
  border-color: hsl(0 0% 100% / 0.08);
  box-shadow:
    inset 0 1px 0 0 hsl(0 0% 100% / 0.08),
    inset 0 0 0 0.5px hsl(0 0% 100% / 0.03),
    0 16px 48px -12px hsl(var(--primary) / 0.4),
    0 4px 20px -4px hsl(0 0% 0% / 0.5);
}
```

### 2. `src/components/ui/mobile-search-pill.tsx`

- Replace the pill `<div>` className: drop `bg-card/95 backdrop-blur-2xl border border-border/60 shadow-[…]`, use `ios-glass-pill-floating` instead.
- Change `h-12` → `h-11`, `max-w-sm` → `max-w-[340px]`.
- Promote the results panel to use `ios-glass-card` (matches the reference dialog), keep `rounded-3xl` and the upward slide-in animation.

### 3. `src/components/dashboard/ClientSearchCommand.tsx` (`MobileGlobalSearchPill`)

- Same className swap on the trigger button: `ios-glass-pill-floating` + `h-11` + `max-w-[340px]`.
- Keep the small ping dot on the right (it's a nice accent) but reduce its color saturation slightly so it doesn't fight the new softer glow.

### 4. No behavior changes

- Hide-on-scroll, keyboard tracking, single-instance registry, and portal mounting all stay identical.
- Desktop rendering is untouched.

## Files to edit

- `src/index.css` — add `.ios-glass-pill-floating` utility (light + dark)
- `src/components/ui/mobile-search-pill.tsx` — swap classes, tighten size
- `src/components/dashboard/ClientSearchCommand.tsx` — swap classes on global pill, tighten size

## Result

The bottom search pill will sit on the screen like the reference dialog: a translucent frosted lozenge with a soft primary glow underneath, a crisp specular highlight on top, and content from the page visibly diffusing through it — distinctly more premium and noticeably more compact than the current version.