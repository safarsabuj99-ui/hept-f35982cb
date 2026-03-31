

# Plan: Compact Mobile Client Cards

## Goal
Reduce card height so more clients fit on one screen on mobile.

## Changes — `src/pages/ClientList.tsx`

Condense the mobile card layout (lines 322-375):

1. **Reduce padding & gaps**: `p-4 space-y-3` → `p-3 space-y-1.5`, outer gap `gap-3` → `gap-2`
2. **Inline Balance & Margin on one row**: Combine Balance and Margin into a single flex row instead of two stacked rows, using a compact `grid-cols-[1fr_auto_auto]` or side-by-side layout
3. **Shrink action buttons**: Remove `pt-1` padding, use smaller button heights (`h-7`), keep side-by-side layout
4. **Tighter name/pricing row**: Reduce vertical spacing between name and pricing badge

Result: Each card shrinks from ~5 visual rows to ~3, fitting roughly 2x more clients per screen.

## Files Modified

1. `src/pages/ClientList.tsx` — Mobile card section only (lines 322-375)

