# Make the Global Search Match the One UI 8.5 Pill Style

The "Search clients…" bar highlighted in red on the admin dashboard is the **global ⌘K search trigger** (`ClientSearchCommand`). Unlike the other 9 page search bars, this one was never migrated to the new `MobileSearchPill` primitive, so on mobile it still shows as a full-width rectangular box inline in the page instead of the pill at the bottom.

This plan fixes that and also tunes the bottom pill's position and width per your feedback ("a little more compact, a little lower").

## What changes (user-facing)

On mobile (<768px), on the admin dashboard (and anywhere else `ClientSearchCommand` is rendered):

- The inline rectangular "Search clients…" bar disappears from the page body.
- A glassmorphic **pill** appears pinned near the bottom of the screen, matching the same pill used everywhere else (Clients, Ad Accounts, Payments, etc.).
- Tapping the pill expands the global search results upward (clients, navigation actions, ⌘K shortcuts) — same behavior as the current desktop ⌘K modal, just bottom-anchored.
- The pill is slightly **narrower** (more inset from screen edges) and sits **a bit lower** for better one-hand thumb reach.

On desktop (≥768px): no change — the inline trigger button with the ⌘K hint stays exactly as today.

## Technical changes

**1. `src/components/dashboard/ClientSearchCommand.tsx`**
- Detect mobile via `useIsMobile()`.
- On mobile, **hide the inline trigger button** (lines 437-456) entirely — render `null` in its place so the dashboard layout collapses naturally.
- On mobile, **always render** a persistent bottom pill (via `createPortal` to `document.body`) using the same visual treatment as `MobileSearchPill`: `rounded-full h-12`, glassmorphic background, soft shadow, safe-area aware, keyboard-aware via `visualViewport`.
- The pill's `<input>` controls a local `query` state. Typing immediately expands an upward-stacking results panel above it that reuses the existing `Command`/`CommandList`/`renderClient` rendering already in the file (no duplicate logic).
- Keep the existing `DialogPrimitive` modal path for **desktop only** (so ⌘K still opens the centered command palette on desktop).
- Keep `mode="hotkey-only"` working: in that mode, no inline trigger AND no bottom pill — only the ⌘K shortcut wires through (so the `GlobalSearchMount` doesn't double up).

**2. `src/components/ui/mobile-search-pill.tsx` — small tuning**
- Reduce pill height from `h-14` to `h-12` (more compact, matches One UI 8.5 proportions).
- Tighten side inset from `px-3` to `px-4` on the wrapper and reduce `max-w-md` to `max-w-sm` so the pill is visibly narrower on phones.
- Lower the resting position: change the fallback bottom offset from `var(--mobile-bottom-offset, 4.5rem)` to `var(--mobile-bottom-offset, 1.25rem)` (since this app has no mobile bottom nav, 4.5rem was lifting the pill too high). Keyboard-aware behavior is unchanged.

**3. Single-instance registry interop**
- The new bottom pill inside `ClientSearchCommand` uses the same `pillCounter`/`activeIds` registry exported from `mobile-search-pill.tsx` (export it) so that when a page like `ClientList` mounts its own `MobileSearchPill`, only the most-recently mounted pill is visible — preventing two pills stacking on screens that have both global search and a page-level search.

## Files touched

- `src/components/dashboard/ClientSearchCommand.tsx` — mobile branch: hide inline trigger, render bottom pill + upward results panel via portal.
- `src/components/ui/mobile-search-pill.tsx` — export registry helpers; shrink to `h-12`, `max-w-sm`, lower default bottom offset to `1.25rem`.

No other pages need changes — the 9 already-migrated pages will automatically pick up the slimmer/lower pill styling.

## Out of scope

- Desktop layout and ⌘K modal behavior (unchanged).
- Other search bars on individual detail pages already work correctly via `MobileSearchPill`.
- No database, RLS, or backend changes.
