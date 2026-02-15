

# Add Date Filter to Client Detail Spend Tab

## Overview
Add the existing `ClientDateFilter` component to the Spend tab in the Client Detail page, allowing admins to filter ad spend data by preset date ranges (Today, Yesterday, This Week, Last Week, This Month, Last Month) or a custom date range.

## What Changes

### In `src/pages/ClientDetail.tsx`

1. **Import** `ClientDateFilter` and its types (`ClientDateRange`, `ClientDatePreset`).

2. **Add state** for the active date filter:
   - `spendDateRange: ClientDateRange | null` (null = all time)
   - `spendDatePreset: ClientDatePreset` (default: "all_time")

3. **Refactor spend loading** into a standalone `loadSpendData(range)` function that:
   - Fetches ad account IDs for the client
   - Queries `daily_ad_spend` with optional `.gte("date", fromDate)` and `.lte("date", toDate)` filters when a range is provided
   - Called from `loadAll()` on initial load, and again when the date filter changes

4. **Wire up the filter callback** `handleSpendDateChange` that updates state and calls `loadSpendData` with the new range.

5. **Add `ClientDateFilter`** to the Spend tab between the `CardHeader` and spend summary badges, so it appears right below the "Ad Spend Summary" title.

6. **Recalculate** `spendByPlatform` and `totalSpend` dynamically since `spendData` state updates when the filter changes -- this already works as-is since those are derived from `spendData`.

### No other files need changes
The `ClientDateFilter` component already exists and handles all preset/custom logic.

## Technical Details

- The `daily_ad_spend.date` column is a `date` type, so filtering uses `format(range.from, "yyyy-MM-dd")` and `format(range.to, "yyyy-MM-dd")` for the `.gte()` / `.lte()` calls.
- The `.limit(100)` on the spend query is kept but could be increased to avoid truncation for longer date ranges.
- The summary badges and total automatically reflect the filtered data since they derive from `spendData` state.
