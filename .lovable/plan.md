

## Plan: Fix Available USD Showing Stale Manual Baseline Value

### Problem

On manual baseline days, the edge function updates only the `metrics` JSONB but leaves `balance_usd` at the original manual value (-$125.71). The UI reads `balance_usd` for "Available USD", so it stays stale even though the correct computed balance ($292.70) exists in the metrics.

### Root Cause

Line 163 in `WalletInventory.tsx`:
```typescript
availableBalance: snap ? Number(snap.balance_usd) : 0,
```

And in the edge function, the manual-baseline update path (around line 178) only updates `metrics` and `notes` — it does **not** touch `balance_usd`.

### Fix (2 changes)

**1. Edge Function (`supabase/functions/auto-snapshot-usd/index.ts`)**

On the manual-baseline update path, also update `balance_usd` with the computed balance:

```typescript
// Change from:
.update({ metrics, notes: `...` })

// To:
.update({ metrics, balance_usd: r2(balance), notes: `...` })
```

This ensures `balance_usd` always reflects the latest computed value, even on manual baseline days.

**2. UI Fallback (`src/pages/WalletInventory.tsx`, line 163)**

Add a fallback so the UI can also derive the balance from metrics if `balance_usd` looks like a stale baseline:

```typescript
// Compute available from metrics if present, otherwise fall back to balance_usd
const computedBalance = (metrics.carry_forward !== undefined)
  ? (metrics.carry_forward + (metrics.bought_since ?? 0) - (metrics.spent_since ?? 0) - (metrics.manual_spend ?? 0))
  : Number(snap.balance_usd);

availableBalance: snap ? computedBalance : 0,
```

### Files Changed

| File | Change |
|------|--------|
| `supabase/functions/auto-snapshot-usd/index.ts` | Add `balance_usd: r2(balance)` to the manual-baseline update |
| `src/pages/WalletInventory.tsx` | Derive availableBalance from metrics fields |

### Result

After deploying and refreshing, Available USD will correctly show ~$292.70 instead of -$126.

