

# Plan: Fix WAC Fallback Logic for COGS Calculation

## Problem
When "Today" is selected but no USD was purchased today, WAC = 0, making COGS = ৳0 and profit = total revenue. The system should fall back to a broader time range for WAC calculation.

## Solution
Implement a cascading WAC fallback in both `FinanceDashboard.tsx` and `ProfitLossWidget.tsx`:

1. **Try selected date range** — calculate WAC from purchases in the filtered period
2. **Fallback to current month** — if no purchases found, fetch this month's purchases and calculate WAC
3. **Fallback to all-time** — if still no purchases this month, fetch all purchases for the last known WAC

## Changes

### `src/pages/FinanceDashboard.tsx` (lines 37-59)
- Keep the date-filtered purchases query as-is
- After calculating WAC, if `totalUsd === 0` (no purchases in range):
  - Run a second query for current month's purchases (`gte` first day of month, `lte` today)
  - If still no results, run a third query with no date filter (all-time)
- Use the first non-zero WAC found

### `src/components/ProfitLossWidget.tsx` (lines 60-73)
- Same cascading fallback logic:
  - Date range → current month → all-time
- Replace the hardcoded `128` fallback with dynamically fetched WAC

### Both files: Helper approach
Extract the WAC fallback into a shared pattern:
```ts
// 1. Try range-filtered purchases
let wac = calcWac(rangePurchases);
// 2. Fallback: this month
if (wac === 0) {
  const monthPurchases = await supabase.from("usd_purchases")
    .select("bdt_amount_paid, usd_received")
    .gte("date", firstDayOfMonth).lte("date", today);
  wac = calcWac(monthPurchases.data);
}
// 3. Fallback: all time
if (wac === 0) {
  const allPurchases = await supabase.from("usd_purchases")
    .select("bdt_amount_paid, usd_received");
  wac = calcWac(allPurchases.data);
}
```

## Files Modified
- `src/pages/FinanceDashboard.tsx`
- `src/components/ProfitLossWidget.tsx`

