

# Fix: Platform Transfers Inflating Today's Collections

## Problem
When you do a platform transfer (e.g., Google to TikTok), the system creates a credit transaction on the destination platform with today's date. The "Today's Collections" KPI on the Admin Dashboard counts ALL credit transactions from today, so the transfer amount gets incorrectly added to collections -- even though no new money was received.

## Solution
Filter out platform transfer transactions from the "Today's Collections" calculation. Transfer transactions already have a description starting with `"Platform transfer:"`, so we can exclude them easily.

## Technical Change

**File: `src/pages/AdminDashboard.tsx` (line 126-127)**

Current code:
```
const todayTxns = transactions.filter((t: any) => t.date === today && t.type === "credit" && t.status === "completed");
```

Updated code -- exclude transfer credits:
```
const todayTxns = transactions.filter((t: any) =>
  t.date === today && t.type === "credit" && t.status === "completed"
  && !(t.description && t.description.startsWith("Platform transfer:"))
);
```

Same filter applied to the 7-day collections sparkline (lines 131-134) so the trend chart is also accurate.

| File | Change |
|------|--------|
| `src/pages/AdminDashboard.tsx` | Exclude "Platform transfer:" transactions from collections KPI and sparkline |

No database or edge function changes needed.
