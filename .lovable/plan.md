## Problem

Ad Guard tab shows **Current Balance $2,114.44** for MUSA, but the Transactions tab correctly shows **$93.27** (Main Balance).

## Root Cause

`src/components/AutomationConfigTab.tsx` (lines 100–108) fetches completed transactions with a plain `supabase.from("transactions").select(...)` — no pagination. Supabase's Data API silently caps result sets at **1000 rows**. MUSA has 1,256+ completed transactions, so the last ~256 rows (older debits or a mix) are dropped, inflating the computed balance.

This is the identical bug we already fixed in `RefundDialog.tsx`; the same fix pattern applies here.

## Fix

In `src/components/AutomationConfigTab.tsx`, replace the direct `.select()` with the existing `fetchAllRows` helper (`@/lib/fetchAllRows`) so every completed transaction is paginated in, then pass the full set to `computeWalletBalance`.

```ts
const txns = await fetchAllRows<{ type: string; amount: number; status: string }>(
  () => supabase
    .from("transactions")
    .select("type, amount, status")
    .eq("client_id", userId)
    .eq("status", "completed")
);
setBalance(computeWalletBalance(txns as any).total);
```

No schema, RLS, or business-logic changes — presentation-layer only. After the fix, Ad Guard's "Current Balance" will match the wallet total shown on the Transactions tab.

## Regression guard

`fetchAllRows` already logs a debug warning when the result count is a perfect multiple of 1000, which helps catch future truncation regressions early.
