

# Fix: "Today" Filter Showing All-Time Data (Race Condition)

## Root Cause
In `AdminDashboard.tsx`, `dateRange` state is initialized as `null` (line 47). The component's `useEffect` on line 61 fires `fetchData()` immediately with `dateRange = null` (which means "all time"). Then `DateRangeFilter`'s own `useEffect` fires `onRangeChange` to set today's range — but by then the first fetch with null is already in-flight. If it resolves after the second fetch, it overwrites correct data with all-time data.

## Fix

### `src/pages/AdminDashboard.tsx`
- Initialize `dateRange` to today's range instead of `null`:
  ```typescript
  const [dateRange, setDateRange] = useState<DateRange | null>({ 
    from: startOfDay(new Date()), 
    to: endOfDay(new Date()) 
  });
  ```
- This ensures the very first `fetchData()` call uses today's range, eliminating the race condition.

### `src/components/DateRangeFilter.tsx`
- Remove the `useEffect` that calls `onRangeChange` on mount (lines 64-67), since the parent already initializes with the correct range. This prevents a redundant second fetch.

### Child components (`SpendTrendChart`, `RevenueVsCostChart`, `ProfitLossWidget`, `ProfitabilityTable`)
- Already handle `dateRange` correctly — when it's a valid range they filter, when null they show all. No changes needed since the parent now never passes null on initial render.

| File | Change |
|------|--------|
| `src/pages/AdminDashboard.tsx` | Initialize `dateRange` to today instead of `null` |
| `src/components/DateRangeFilter.tsx` | Remove mount-time `useEffect` that triggers duplicate fetch |

