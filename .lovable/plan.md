

## Plan: Compact Mobile Payment Cards + Fix Date Filter

### Problem 1: Date filter shows "Today" but doesn't filter
The `DateRangeFilter` component defaults its UI to "Today" (line 67) but never calls `onRangeChange` on mount. Meanwhile `PaymentRequests` initializes `dateRange` as `null` (no filter), so all data shows despite "Today" appearing selected.

**Fix** — `src/components/DateRangeFilter.tsx`: Add a `useEffect` on mount that calls `onRangeChange` with today's range, syncing the parent state to match the UI.

### Problem 2: Mobile payment cards too large
Each card uses a spacious layout with `p-4`, 2×2 grid, full-width buttons, and separate proof image row.

**Fix** — `src/pages/PaymentRequests.tsx` (lines 305–351): Redesign mobile cards to a compact layout:
- Reduce padding to `p-3`, gap to `gap-2`
- Row 1: Client name + status badge (same line)
- Row 2: Amount, Method, Date, Platform — inline with smaller text (`text-xs`), use a tight `grid-cols-4` instead of `grid-cols-2`
- USD Credited stays as a small footer line
- Proof image thumbnail shrinks to `h-10`
- Approve/Reject buttons side by side in one row instead of stacked

### Files Changed
1. `src/components/DateRangeFilter.tsx` — add mount-time `useEffect`
2. `src/pages/PaymentRequests.tsx` — compact mobile card layout

