

## Financial Intelligence Mobile Responsiveness Fix

### Problem
The screenshot shows the ProfitabilityTable on mobile (390px) rendering as a desktop table with columns cut off — Revenue (BDT), Cost, Profit, and Margin columns are clipped. The table needs a mobile card view instead of horizontal scrolling.

### Solution
Replace the scrollable table on mobile with touch-friendly card rows (matching the dual-view pattern used throughout the app), while keeping the expandable platform detail.

### Changes

**File: `src/components/dashboard/ProfitabilityTable.tsx`**
- Add a mobile card view (`md:hidden`) with expandable platform details per client
- Each card shows: Client name, margin badge, Spend, Revenue, Cost, Profit in a 2-col grid
- Tapping a card expands platform sub-rows with rate/gap details
- Keep existing desktop table as `hidden md:block`

**File: `src/pages/AdminDashboard.tsx`** (line 319)
- Change Financial Intelligence grid from `grid gap-4 md:grid-cols-2` to stack on mobile: ensure both widgets render full-width on small screens (already does this, no change needed)

### Technical Details
- Mobile card layout: `rounded-xl border p-4 space-y-3 bg-card` with `cursor-pointer` for expand
- Platform sub-details shown inline with colored badges and rate/gap info
- ProfitLossWidget is already responsive (simple flex rows) — no changes needed

