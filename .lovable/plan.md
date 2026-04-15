
## What I found

I checked the wallet page, the auto-snapshot function, and the live snapshot data. The bug is confirmed.

Right now the latest manual snapshot row for `2026-04-15` is already corrupted:
- `balance_usd = 1547.65`
- `metrics.carry_forward = 1129.31`
- `bought_since = 505.99`
- `spent_since = 87.65`

That means every refresh is re-adding the same net daily activity:

```text
505.99 - 87.65 = +418.34
```

That exactly explains why the number keeps jumping on every refresh.

## Exact bug

The previous fix created a compounding bug:

1. `auto-snapshot-usd` updates `balance_usd` on the manual-baseline row.
2. On the next refresh, the function uses that already-updated `balance_usd` as the new carry forward.
3. Because the filters now use `gte(...)`, the same day's purchase/spend is included again.
4. Result: each refresh adds the same daily net amount again and again.

So the manual baseline is no longer a fixed baseline. It became a moving total, which breaks the calculation.

## Fix plan

### 1. Make the baseline immutable
Add a dedicated immutable field for the real manual baseline in `usd_inventory_snapshots` (via migration), e.g. `baseline_balance_usd`.

This separates:
- fixed opening/close balance
- current computed available balance

### 2. Repair the already-broken row
Run a one-time data repair for today’s manual snapshot:
- restore the original manual baseline value (`-125.71`) into the immutable baseline field
- recompute the current available balance from real activity
- refresh once so the row lands on the correct total instead of the inflated one

### 3. Fix `auto-snapshot-usd`
Update the function so it:
- uses `baseline_balance_usd` as carry forward for manual rows
- never mutates that baseline again
- updates only derived metrics and current `balance_usd`
- stops overwriting the original manual note on every refresh

### 4. Keep the UI safe
Update `WalletInventory.tsx` so:
- **Carry Forward** shows the immutable baseline
- **Available USD** shows the computed current balance
- old/bad rows still fall back safely instead of displaying inflated numbers

### 5. Verify the exact failure path
After the fix, test this flow:
- manual baseline exists
- add a USD purchase
- click refresh multiple times
- confirm Available USD stays unchanged unless new spend/purchase data arrives
- add ad spend/manual spend and confirm only the new delta is applied once

## Files / areas to update

- `supabase/migrations/...` — add immutable baseline field and repair corrupted snapshot data
- `supabase/functions/auto-snapshot-usd/index.ts` — stop compounding by separating baseline from current balance
- `src/pages/WalletInventory.tsx` — read/display immutable baseline and safe computed available balance

## Expected result

After this fix:
- Refresh will no longer increase Available USD by itself
- The current inflated row will be repaired
- The number will return to the real computed balance
- Manual baseline, purchases, and spend will each behave correctly without overwriting each other

## Technical summary

Current broken formula:
```text
mutated manual row balance_usd
+ same-day purchases
- same-day spend
= inflated total on every refresh
```

Correct formula:
```text
immutable manual baseline
+ activity since baseline
= current available balance
```
