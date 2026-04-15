

## Plan: Fix USD Inventory Not Counting Same-Day Purchases

### Problem

The `auto-snapshot-usd` edge function uses `gt("date", baselineDate)` — strictly **greater than** — to filter purchases, ad spend, and manual spends since the last baseline. Since the baseline date is `2026-04-15` and the $505.989 purchase is also on `2026-04-15`, it gets excluded. Result: Available USD stays at -$126 instead of reflecting the new purchase.

### Fix

**File: `supabase/functions/auto-snapshot-usd/index.ts`** (lines 59-66)

Change all three filters from `gt` to `gte`:

```typescript
// Before:
q.gt("date", baselineDate)
q.gt("data_date", baselineDate)
q.gt("date", baselineDate)

// After:
q.gte("date", baselineDate)
q.gte("data_date", baselineDate)
q.gte("date", baselineDate)
```

This is safe because the manual baseline's `balance_usd` is a frozen value (-$125.71) — it does not include any purchases/spend from the baseline day itself. The carry-forward plus same-day activity gives the correct balance.

### Result

After deploying and refreshing, Available USD will show: **-$125.71 + $505.989 = ~$380.28** (minus any same-day ad spend).

### Files Changed

| File | Change |
|------|--------|
| `supabase/functions/auto-snapshot-usd/index.ts` | `gt` → `gte` on 3 filters (lines 60, 63, 66) |

