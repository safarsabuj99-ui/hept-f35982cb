

# Add Date Range Filter to Admin Dashboard

## What Changes
Add the existing `DateRangeFilter` component to the Admin Dashboard header area, defaulting to "Today". The selected date range will filter all date-sensitive data: KPI cards (spend, collections), ProfitabilityTable, ProfitLossWidget, SpendTrendChart, RevenueVsCostChart, and the client spend in ClientOverviewTable.

## Changes

### 1. `src/pages/AdminDashboard.tsx`
- Import `DateRangeFilter` and its `DateRange`/`DatePreset` types
- Add `dateRange` and `datePreset` state (default: today)
- Place `<DateRangeFilter>` below the `DashboardHeader`
- Refactor `fetchData` to accept and use `dateRange` for all date-sensitive queries (`daily_metrics`, `transactions` date filtering)
- Pass `dateRange` as props to child components that fetch their own data

### 2. `src/components/ProfitLossWidget.tsx`
- Accept optional `dateRange?: { from: Date; to: Date }` prop
- Filter `daily_metrics` query with `.gte("data_date", ...)` and `.lte("data_date", ...)` when range is provided

### 3. `src/components/dashboard/ProfitabilityTable.tsx`
- Accept optional `dateRange` prop
- Apply date filter to `daily_metrics` query

### 4. `src/components/SpendTrendChart.tsx`
- Accept optional `dateRange` prop
- Use range to constrain the date window instead of hardcoded 30-day lookback

### 5. `src/components/dashboard/RevenueVsCostChart.tsx`
- Accept optional `dateRange` prop
- Filter `daily_ad_spend` query by date range

### 6. `src/components/dashboard/ClientOverviewTable.tsx`
- Already receives computed data from parent — no change needed (parent filters the data)

### Files Summary

| File | Change |
|------|--------|
| `src/pages/AdminDashboard.tsx` | Add DateRangeFilter, pass range to all children and own queries |
| `src/components/ProfitLossWidget.tsx` | Accept `dateRange` prop, filter metrics |
| `src/components/dashboard/ProfitabilityTable.tsx` | Accept `dateRange` prop, filter metrics |
| `src/components/SpendTrendChart.tsx` | Accept `dateRange` prop, filter by range |
| `src/components/dashboard/RevenueVsCostChart.tsx` | Accept `dateRange` prop, filter by range |

