# Hide Bottom Search Pill on Scroll Down, Reveal on Scroll Up

Many pages (Clients, Ad Accounts, Payments, Orders, etc.) have filter rows of buttons just above the content area. Right now the persistent bottom search pill can sit on top of those buttons while the user is scrolling through long lists. This makes it harder to scan the list and tap filters.

We'll add a smooth auto-hide behavior, exactly like One UI 8.5 / iOS Safari toolbars:

- Scroll **down** → the pill **slides down off-screen and fades out**.
- Scroll **up** (even a small nudge) → the pill **slides back up and fades in**.
- At the top of the page → pill is always visible.
- While the on-screen keyboard is open (user actively typing) → pill stays visible regardless of scroll, so search is never hijacked.
- When search results are expanded → pill stays visible regardless of scroll.

## Technical changes

**1. New shared hook: `src/hooks/use-hide-on-scroll.ts`**
- Tracks `window.scrollY` via a `requestAnimationFrame`-throttled `scroll` listener (passive + capture phase, so nested scroll containers also trigger it).
- Computes a delta from the last recorded position; if downward delta > 8px → `hidden = true`. If upward delta > 8px → `hidden = false`.
- Always returns `hidden = false` while `scrollY <= 64` (top-of-page guard).
- Accepts `enabled`, `threshold`, and `topGuard` options.

**2. `src/components/ui/mobile-search-pill.tsx`**
- Call `useHideOnScroll({ enabled: !expanded && keyboardOffset === 0 })`.
- Apply translate + opacity transition classes to the outer fixed wrapper:
  ```
  transition-[transform,opacity] duration-300 ease-out
  hidden ? "translate-y-[140%] opacity-0 pointer-events-none" : "translate-y-0 opacity-100"
  ```
- The existing `bottom` style transition is preserved for keyboard offset.

**3. `src/components/dashboard/ClientSearchCommand.tsx` — `MobileGlobalSearchPill`**
- Same hook + same translate/opacity classes on the fixed wrapper, so the global search pill on the admin dashboard hides/reveals identically.

## Out of scope

- Desktop layout (no change).
- The expanded results panel — when the user is actively searching/typing, the pill stays put.
- No changes to existing keyboard-offset / safe-area / single-instance-registry logic.

## Files touched

- `src/hooks/use-hide-on-scroll.ts` *(new)*
- `src/components/ui/mobile-search-pill.tsx`
- `src/components/dashboard/ClientSearchCommand.tsx`
