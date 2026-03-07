

# Show Collections in BDT (Original Payment Amount)

## Problem
The Collections KPI card currently sums `transactions.amount` which stores USD values. You want to see the original BDT amount that clients actually paid.

## Solution
Switch the collections calculation to query `payment_requests` (where `status = 'approved'`) and sum `amount_bdt` instead of using the USD-converted `transactions.amount`. Display with ৳ symbol.

## Changes

### `src/pages/AdminDashboard.tsx`

1. **Fetch payment_requests instead of filtering transactions for collections:**
   - Add a query: `supabase.from("payment_requests").select("amount_bdt, created_at").eq("status", "approved")`
   - Apply the same date range filter on `created_at`
   - Sum `amount_bdt` for the total

2. **Update KPI display:**
   - Change `$${todayCollections}` → `৳${todayCollections}` 
   - Change subtitle from `"USD"` to `"BDT"`

3. **Update sparkline data:**
   - Build `dailyCollMap` from approved `payment_requests.amount_bdt` grouped by date instead of from `transactions`

| File | Change |
|------|--------|
| `src/pages/AdminDashboard.tsx` | Query `payment_requests` for BDT amounts, display with ৳ symbol |

