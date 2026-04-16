

## Plan: Fix Negative Balance Display on Client Dashboard

### Problem
When `balance < 0`, the BDT amount on line 293 uses `Math.abs(balanceBdt)` which removes the negative sign. The screenshot shows `৳2,853.60` with no negative indicator or red color — it looks like a positive balance, which is misleading.

### Fix

**File: `src/pages/ClientDashboard.tsx`** (lines 290-298)

Change the negative balance display to:
1. Add a minus sign prefix: `-৳2,853.60`
2. Make the BDT text red (`text-red-300`) to match the USD subtitle styling
3. Keep the USD subtitle as-is (already red)

```tsx
{balance < 0 ? (
  <>
    <p className="text-2xl md:text-4xl font-bold font-mono text-red-300 count-up">
      -৳{Math.abs(balanceBdt).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
    </p>
    <p className="text-sm font-mono text-red-300 mt-0.5">
      {fmt(balance)}
    </p>
  </>
) : ( ... )}
```

Also check the `runwayDays` calculation on line 221 — when balance is negative, runway should show as negative/zero, not `-7 days`. Currently it does `Math.floor(balance / avgDailySpend)` which produces negative values. This is fine to keep as-is since it communicates urgency.

### Files Changed

| File | Change |
|------|--------|
| `src/pages/ClientDashboard.tsx` | Add `-` prefix and `text-red-300` to negative BDT balance display |

