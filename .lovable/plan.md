

## Fix: USD Inventory Showing Incorrect Balance (-$346)

### Root Cause

The `auto-snapshot-usd` edge function uses an **incremental calculation** — it takes yesterday's snapshot balance as carry-forward, then adds purchases and subtracts spend since that date. This has two fatal flaws:

1. **Cascading corruption**: If any single snapshot is wrong (e.g., the first one was created with $0 before the day's purchase was recorded), every subsequent snapshot inherits and compounds the error.
2. **Missing intermediate snapshots**: Some snapshots were deleted during a data reset, causing the `since_date` references to break and purchases to be skipped entirely.

Your 3 purchases ($19.80 + $269.34 + $267.80 = $556.93) were never counted, resulting in a balance of -$345.97 instead of the correct ~$210.

### The Fix

**1. Rewrite `auto-snapshot-usd` edge function** — switch from incremental (carry-forward) to **full recomputation** every time:

```
balance = SUM(all usd_purchases.usd_received) - SUM(all daily_metrics.spend)
```

This is immune to corrupted history. With the current data volume, querying all purchases and all spend is fast enough.

**2. Delete all existing corrupted snapshots** — clear the `usd_inventory_snapshots` table so the next run creates a fresh, correct snapshot.

**3. Trigger a fresh snapshot** — invoke the fixed function to generate a correct balance immediately.

### Changes

- **`supabase/functions/auto-snapshot-usd/index.ts`**: Remove the "get latest snapshot + carry forward" logic. Instead, sum ALL `usd_purchases.usd_received` and subtract ALL `daily_metrics.spend` to compute balance from scratch every run. Keep the 7-day burn rate, client obligations, and runway calculations as-is.

- **Database**: Delete all rows from `usd_inventory_snapshots` to clear corrupted data, then trigger the edge function to create a fresh correct snapshot.

### Expected Result
- Balance will correctly show ~$210 (total purchased $556.93 minus total spend)
- Future snapshots will always be accurate since they recompute from source data
- No performance concern — the full-scan approach is appropriate for the current data volume

