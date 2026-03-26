

## Mobile Responsiveness Fixes

Based on the uploaded screenshots and code analysis, there are 3 key mobile issues to fix:

### Issue 1: Client Detail Tabs Overflow (Image 1)
The `TabsList` uses `grid-cols-4` on mobile for 8 tabs, causing them to wrap into a cramped 2-row grid with tiny text. 

**Fix**: Replace the grid layout with a horizontally scrollable row using `overflow-x-auto flex-nowrap`, matching the pattern already used by `ClientDateFilter`.

**File**: `src/pages/ClientDetail.tsx` (line 481)
- Change `<TabsList className="grid w-full grid-cols-4 sm:grid-cols-8">` to a flex-based scrollable container with `overflow-x-auto scrollbar-hide flex-nowrap w-full`

### Issue 2: Date Range Filter Vertical Stack (Image 2)
The `DateRangeFilter` component uses `flex-wrap` which causes buttons to stack vertically on mobile, taking up excessive space.

**Fix**: Change to horizontal scroll like `ClientDateFilter` already does — `overflow-x-auto scrollbar-hide snap-x flex-nowrap` with `shrink-0` on buttons.

**File**: `src/components/DateRangeFilter.tsx` (line 90)
- Replace `flex-wrap` with `overflow-x-auto scrollbar-hide snap-x snap-mandatory flex-nowrap`
- Add `shrink-0 snap-start` to each button
- Add consistent sizing `h-9 text-sm md:h-8 md:text-xs`

### Issue 3: Profitability Table Horizontal Overflow
The 7-column table in `ProfitabilityTable` overflows on 390px screens without any scroll container.

**Fix**: Wrap the table in `overflow-x-auto` and add a mobile card view for the main rows.

**File**: `src/components/dashboard/ProfitabilityTable.tsx`
- Wrap `<Table>` in `<div className="overflow-x-auto -mx-4 px-4">`
- Add `min-w-[600px]` to the table to prevent column squishing
- Use `whitespace-nowrap` on header cells

### Issue 4: Client Profit Tab Cards
The `ClientProfitTab` platform cards grid uses `sm:grid-cols-3` which is fine, but the summary table inside also needs horizontal scroll protection.

**File**: `src/components/ClientProfitTab.tsx`
- Wrap the summary `<Table>` in `overflow-x-auto`

### Issue 5: Profit/Loss Widget
Already responsive (simple flex rows), no changes needed.

### Files Changed

| File | Change |
|------|--------|
| `src/pages/ClientDetail.tsx` | Scrollable tab bar instead of grid |
| `src/components/DateRangeFilter.tsx` | Horizontal scroll instead of flex-wrap |
| `src/components/dashboard/ProfitabilityTable.tsx` | Add overflow-x-auto wrapper, min-width |
| `src/components/ClientProfitTab.tsx` | Add overflow-x-auto to summary table |

