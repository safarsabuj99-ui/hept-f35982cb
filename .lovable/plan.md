

# Fix "All Time" Date Filter Not Showing All Data

## Problem
When clicking "All Time", the `dateRange` becomes `null`. In `AdminDashboard.fetchData`, null falls back to `today`'s date, so it only queries today's data instead of removing the date filter entirely. The same issue likely exists in `ProfitLossWidget`, `ProfitabilityTable`, `SpendTrendChart`, and `RevenueVsCostChart`.

## Fix

### `src/pages/AdminDashboard.tsx`
- When `dateRange` is `null`, build the spend query **without** `.gte()` / `.lte()` date filters so it returns all rows
- Currently: `const rangeFrom = dateRange ? toISODate(dateRange.from) : today` — this incorrectly defaults to today

### `src/components/ProfitLossWidget.tsx`
- When `dateRange` is `null`, skip adding date filters to the `daily_metrics` query

### `src/components/dashboard/ProfitabilityTable.tsx`
- Same: skip date filters when `dateRange` is `null`

### `src/components/SpendTrendChart.tsx`
- When `dateRange` is `null`, use the default 30-day lookback or show all data

### `src/components/dashboard/RevenueVsCostChart.tsx`
- When `dateRange` is `null`, show all data without date constraints

### Pattern
```typescript
// Before (broken):
let query = supabase.from("daily_metrics").select("spend, campaign_id")
  .gte("data_date", rangeFrom).lte("data_date", rangeTo);

// After (fixed):
let query = supabase.from("daily_metrics").select("spend, campaign_id");
if (dateRange) {
  query = query.gte("data_date", toISODate(dateRange.from))
               .lte("data_date", toISODate(dateRange.to));
}
```

| File | Change |
|------|--------|
| `src/pages/AdminDashboard.tsx` | Conditionally apply date filters only when `dateRange` is not null |
| `src/components/ProfitLossWidget.tsx` | Same conditional pattern |
| `src/components/dashboard/ProfitabilityTable.tsx` | Same conditional pattern |
| `src/components/SpendTrendChart.tsx` | Same conditional pattern |
| `src/components/dashboard/RevenueVsCostChart.tsx` | Same conditional pattern |

