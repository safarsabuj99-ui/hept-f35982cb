# Mobile Double-Tap to Open Global Search

## Goal
On mobile, allow the user to **double-tap anywhere** on a page to instantly open the global client search popup (the same `⌘K` popup that already exists on desktop). Works across every authenticated page (Admin, Manager, Client, Platform layouts).

## How It Will Feel
- User taps twice quickly (within ~300ms) on any empty area of the screen → search popup slides up.
- Tapping interactive elements (buttons, inputs, links, the existing bottom search pill) does **NOT** trigger it — so normal taps still work.
- Works whether the user is scrolling, reading a table, or on a detail page.
- Subtle haptic vibration (10ms) on supported devices for tactile feedback.
- Auto-disables in text inputs / textareas so editing remains smooth.

## Technical Plan

### 1. New hook: `src/hooks/useDoubleTapGesture.ts`
A reusable hook that:
- Listens to `pointerdown` on `document` (mobile only — checks `useIsMobile`).
- Tracks the last tap's `timestamp` and `(x, y)` coordinates.
- Triggers the callback when **two taps** occur within **300ms** AND within **40px** of each other (prevents accidental scroll-related double fires).
- Ignores taps where `e.target` matches: `input, textarea, select, button, a, [role="button"], [contenteditable], [data-no-double-tap]`.
- Uses `pointerType === "touch"` filter so mouse double-clicks on desktop are unaffected.
- Calls `navigator.vibrate?.(10)` for haptic feedback.
- Cleans up listeners on unmount.

### 2. New component: `src/components/MobileDoubleTapSearch.tsx`
- Owns local `open` state for the search dialog.
- Uses `useDoubleTapGesture` to flip `open = true`.
- Renders `<ClientSearchCommand mode="hotkey-only" forceOpen={open} onOpenChange={setOpen} />`.

### 3. Small extension to `ClientSearchCommand.tsx`
Add two **optional** props (fully backward compatible):
- `forceOpen?: boolean` — when defined, the parent controls `open`.
- `onOpenChange?: (open: boolean) => void` — relays state changes back.

If `forceOpen` is provided, the internal `open` state is replaced by the controlled value. The existing ⌘K listener and visible trigger keep working unchanged.

### 4. Mount it in `GlobalSearchMount.tsx`
Add `<MobileDoubleTapSearch clients={clients ?? []} />` next to the existing `ClientSearchCommand`. Since `GlobalSearchMount` is already rendered inside every authenticated layout (Admin, Manager, Client, Platform), the gesture becomes available project-wide automatically — no per-page changes needed.

### 5. Safety guards
- A short **cooldown (600ms)** after opening prevents the popup from re-toggling if the user keeps tapping.
- If the popup is already open, double-tap is ignored (let the popup handle its own UX).
- Add `data-no-double-tap` to the existing mobile search pill wrapper so tapping it never accidentally counts as a double-tap.

## Files Touched
- **New**: `src/hooks/useDoubleTapGesture.ts`
- **New**: `src/components/MobileDoubleTapSearch.tsx`
- **Edit**: `src/components/dashboard/ClientSearchCommand.tsx` (add 2 optional controlled props)
- **Edit**: `src/components/GlobalSearchMount.tsx` (mount the new component)
- **Edit**: `src/components/ui/mobile-search-pill.tsx` (add `data-no-double-tap` to the pill wrapper)

## Out of Scope
- No changes to desktop behavior — ⌘K still works exactly as today.
- No changes to the existing bottom-pinned mobile pill — both gestures will coexist.
