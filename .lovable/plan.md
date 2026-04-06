

## Fix: Campaign Controls Bar Overflow on Mobile

### Problem
On the 390px mobile viewport, the "Client" dropdown (`w-48` = 192px) and the "Date Range" filter (horizontal scrolling pill buttons) sit side-by-side via `flex-wrap`. The Client dropdown takes ~192px + gap, leaving insufficient space for the date range pills — causing the "Today" button to clip off-screen (visible in the red-marked screenshot).

### Solution
Stack the controls vertically on mobile instead of side-by-side. Use `flex-col sm:flex-row` so they each take full width on small screens and sit inline on larger screens. Also make the Client dropdown full-width on mobile.

### File: `src/pages/CampaignMapping.tsx`

**Line 227** — Change the controls bar flex direction:
```
flex flex-wrap items-end gap-4
```
→
```
flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-end gap-3 sm:gap-4
```

**Line 237** — Make Client dropdown responsive width:
```
w-48 h-9
```
→
```
w-full sm:w-48 h-9
```

**Line 275** — The date range wrapper already has `flex-1 min-w-0` which is correct; no change needed there.

This ensures both controls get full width on mobile (stacked), and return to inline layout on `sm+` breakpoints. Clean, minimal, no functional changes.

