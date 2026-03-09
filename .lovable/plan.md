
# Plan: Fix Timezone Mismatch for "Today" Across All Pages

## Problem Identified

**Root Cause**: The system has inconsistent timezone handling:
- **Edge Functions** (correct): Use `Asia/Dhaka` timezone via `getDhakaToday()`
- **Frontend Pages** (wrong): Use UTC via `new Date().toISOString().split("T")[0]`

This causes a **date shift** around midnight:
- At 2:00 AM in Dhaka (which is 8:00 PM UTC previous day), the frontend shows "yesterday" as UTC date
- Meta API returns spend for today (Dhaka time), but frontend queries with wrong date

## Affected Files

| File | Issue |
|------|-------|
| `src/pages/AdminDashboard.tsx` | Lines 56-57, 117, 128, 190 use UTC |
| `src/pages/ClientDashboard.tsx` | Line 129 uses UTC |
| `src/components/dashboard/SystemHealthWidget.tsx` | Line 36 uses UTC |
| `src/components/RunwayPrediction.tsx` | Line 57 uses UTC |
| `src/components/LowBalanceAlerts.tsx` | Line 31 uses UTC |
| `src/pages/AddFunds.tsx` | Line 21 uses UTC (form default) |
| `src/pages/WalletInventory.tsx` | Line 37 uses UTC (form default) |
| `src/pages/ExpenseManager.tsx` | Line 47 uses UTC (form default) |
| `supabase/functions/billing-radar/index.ts` | Line 29 uses UTC |

## Solution

### 1. Create Centralized Date Helper

Add a `getLocalDateString(offset?: number)` function to `DateRangeFilter.tsx` that returns YYYY-MM-DD in Asia/Dhaka timezone with optional day offset.

### 2. Replace All UTC Date Calculations

Replace:
```typescript
// BAD - UTC timezone
const today = new Date().toISOString().split("T")[0];
const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
```

With:
```typescript
// GOOD - Asia/Dhaka timezone
import { getDhakaDateString } from "@/components/DateRangeFilter";
const today = getDhakaDateString();
const yesterday = getDhakaDateString(-1);
```

### 3. Fix Edge Function

Update `billing-radar/index.ts` to use same `getDhakaToday()` pattern already used in `sync-fast-lane`.

## Files to Modify

1. **`src/components/DateRangeFilter.tsx`** - Add `getDhakaDateString(offset?: number)` helper
2. **`src/pages/AdminDashboard.tsx`** - Replace 5 UTC date usages
3. **`src/pages/ClientDashboard.tsx`** - Replace 1 UTC date usage
4. **`src/components/dashboard/SystemHealthWidget.tsx`** - Replace 1 UTC date usage
5. **`src/components/RunwayPrediction.tsx`** - Replace 1 UTC date usage
6. **`src/components/LowBalanceAlerts.tsx`** - Replace 1 UTC date usage
7. **`src/pages/AddFunds.tsx`** - Replace form default date
8. **`src/pages/WalletInventory.tsx`** - Replace form default date
9. **`src/pages/ExpenseManager.tsx`** - Replace form default date
10. **`supabase/functions/billing-radar/index.ts`** - Replace with Dhaka timezone

## Expected Result

After fix, all date comparisons and queries will use Asia/Dhaka timezone consistently:
- "Today" filter correctly matches today's date in Dhaka
- Meta spend synced for March 9 (Dhaka) will display under March 9 filter
- No more 1-day date shift around midnight
