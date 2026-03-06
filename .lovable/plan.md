

# Change Default Date Filter to "Today"

All date filter components currently default to `"all_time"`. Change them to `"today"` so pages load showing today's data.

## Changes

### 1. `src/components/DateRangeFilter.tsx` (line 60)
- Change default state from `"all_time"` to `"today"`
- Add `useEffect` to fire `onRangeChange` with today's range on mount

### 2. `src/components/ClientDateFilter.tsx` (line 64)
- Change default internal preset from `"all_time"` to `"today"`
- Add `useEffect` to fire `onRangeChange` with today's range on mount

### 3. Pages that manage their own preset state — change initial value from `"all_time"` to `"today"` and set initial date range to today:
- `src/pages/ClientDashboard.tsx` (line 139)
- `src/pages/ClientDetail.tsx` (line 73)
- `src/pages/AdAccountDetail.tsx` (line 60)
- `src/pages/ClientReports.tsx` (line 27)

Each page will initialize `dateRange` / `spendDateRange` to `{ from: startOfDay(now), to: endOfDay(now) }` instead of `null`, and set the preset to `"today"`.

