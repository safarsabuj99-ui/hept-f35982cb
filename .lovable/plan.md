# One UI 8.5 — Persistent Bottom Pill Search

## What's wrong today

On mobile, every page that uses `MobileSearchPill` still shows the **old inline search bar** at its original spot in the page (top of the list / header area). Only when the user taps it does the bottom-anchored pill sheet slide up.

You want the opposite: the moment a user opens a page with search, the **inline bar should be hidden** and a **pill-shaped search bar should already be sitting at the bottom of the screen** (Samsung One UI 8.5 style), ready to type into without any extra tap.

## What we'll change

Refactor **only** `src/components/ui/mobile-search-pill.tsx` — no page-level edits needed since all 9 pages already consume this primitive.

### Mobile (<768px) — new behavior

1. **Hide the inline trigger entirely.** Where the page used to render an inline search input, render `null` (or an invisible spacer so layout doesn't jump).
2. **Render a fixed pill at the bottom of the viewport** via React portal:
   - Position: `fixed inset-x-3 bottom-3 z-40`
   - Shape: `h-14 rounded-full` glassmorphic pill (`bg-card/95 backdrop-blur-2xl`, soft upward shadow)
   - Contains: search icon, live `<input>` bound to the same `value` / `onChange`, clear (✕) button when text is present
   - Respects `env(safe-area-inset-bottom)` for notched devices
3. **Always-on input** — typing filters the underlying page list immediately, exactly like the desktop input does today. No modal, no overlay, no "Done" button needed for the basic case.
4. **Optional results preview** — for pages that pass `renderResults` (currently only the global ⌘K search via `ClientSearchCommand`), tapping the pill expands an upward-stacking results panel above it. For all the simple "filter this list" pages (Clients, Ad Accounts, Orders, etc.), no preview is shown — the page itself is the result.
5. **Bottom-nav awareness** — the pill sits above the existing mobile bottom navigation by adding `bottom-[calc(4rem+env(safe-area-inset-bottom))]` when a bottom nav is detected (we'll use a simple CSS variable `--mobile-bottom-offset` already used elsewhere, falling back to a safe default).
6. **Single instance guard** — if multiple components on the same page mount a pill (rare but possible), only the most recently mounted one is visible; the others stay dormant. This avoids stacking pills.

### Desktop (≥768px) — unchanged

Renders the existing inline `<Input>` exactly as today. No visual or behavioral change.

### Global search (⌘K) on mobile

`ClientSearchCommand` will continue to work: opening it via the floating action / shortcut shows the results panel above the same persistent pill, anchored at the bottom.

## Visual reference

```text
Mobile page (e.g. /admin/clients)
┌─────────────────────────────┐
│  Header / KPIs              │
│  ─────────────────────────  │
│  Client list rows…          │
│  Client list rows…          │
│  Client list rows…          │
│                             │
│   (no inline search bar)    │
│                             │
│  ┌───────────────────────┐  │  ← fixed bottom pill
│  │ 🔍  Search clients… ✕│  │
│  └───────────────────────┘  │
│        [bottom nav]         │
└─────────────────────────────┘
```

## Files to change

- `src/components/ui/mobile-search-pill.tsx` — refactor mobile branch from "trigger + dialog" to "hidden inline + portal-rendered fixed pill". Desktop branch untouched.

No other files need editing — the API (`value`, `onChange`, `placeholder`, `renderResults`) stays identical, so all 9 consumer pages keep working without modification.

## Edge cases handled

- **Keyboard pushes pill up** on iOS/Android — `position: fixed` + `env(safe-area-inset-bottom)` keeps it above the keyboard on modern browsers; we'll also add `visualViewport` listener as a fallback to nudge the pill above the keyboard on older Android.
- **Page scroll** — pill stays anchored, doesn't scroll with content.
- **Page change** — pill unmounts cleanly with the consumer component (no leftover ghost pill).
- **Tablet ≥768px** — completely opted out; existing desktop layout preserved.