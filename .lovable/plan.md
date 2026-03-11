

# Fix: Yesterday Filter Not Showing Spend Data

## Root Cause

The `filterByDate` function (line 175-181) compares `Date` objects, but there's a timezone mismatch:
- `dateRange.from/to` are created as **local time** midnight: `new Date("2026-03-10T00:00:00")` (Asia/Dhaka)
- `item.date` is a date string like `"2026-03-10"` — `new Date("2026-03-10")` parses as **UTC midnight**

Since Asia/Dhaka is UTC+6, `new Date("2026-03-10")` (UTC midnight) is *before* `new Date("2026-03-10T00:00:00")` (local midnight), so the `>=` comparison fails and yesterday's data gets filtered out.

## Fix

Replace Date-object comparison with simple **string comparison** of `YYYY-MM-DD` values. Since `dateRange` dates are already Dhaka-timezone-aligned and `item.date` / `item.data_date` are `YYYY-MM-DD` strings, this is both simpler and correct:

### File: `src/pages/ClientDashboard.tsx`

Replace `filterByDate` (lines 175-181):

```typescript
const filterByDate = useCallback((items: any[], dateField: string) => {
  if (!dateRange) return items;
  const fromStr = format(dateRange.from, "yyyy-MM-dd");
  const toStr = format(dateRange.to, "yyyy-MM-dd");
  return items.filter((item) => {
    const d = item[dateField]?.substring(0, 10); // "YYYY-MM-DD"
    return d >= fromStr && d <= toStr;
  });
}, [dateRange]);
```

This uses lexicographic string comparison on ISO date strings — no timezone conversion, no ambiguity. Single file edit.

