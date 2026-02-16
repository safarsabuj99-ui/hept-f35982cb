

## Fix: Pin Sign Out and Theme Toggle to Bottom of Sidebar

The sidebar footer containing "Sign Out" and the theme toggle currently scrolls away when the navigation list is long. The fix ensures it always stays visible at the bottom corner.

### What Changes

**File: `src/components/AdminLayout.tsx`**

- The desktop sidebar (`<aside>`) already uses `flex flex-col`, but the footer section (Sign Out + Theme Toggle) can get pushed off-screen when nav items overflow.
- Make the sidebar a fixed-height scrollable container:
  - Add `sticky top-0 h-screen` to the `<aside>` so it stays in view while scrolling main content.
  - The nav section already has `overflow-y-auto` and `flex-1`, which is correct.
  - Add `shrink-0` to the footer `<div>` to prevent it from being compressed.

This ensures the Sign Out button and theme toggle are always pinned to the bottom-left corner regardless of scroll position.

### Technical Details

1. Update the `<aside>` element (line 46): add `sticky top-0 h-screen` classes.
2. Update the footer div (line 68): add `shrink-0` class to prevent flex shrinking.

No other files need changes.

