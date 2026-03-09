

# Plan: Add WAC Cascading Fallback to All Profit Calculation Pages

## Problem
Two additional files still use a simple WAC calculation (`totalUsd > 0 ? totalBdt / totalUsd : 128`) with no date-range fallback. When no USD purchases exist in the selected period, they fall back to a hardcoded `128` instead of trying current month → all-time like the already-fixed files.

## Files That Need the Fix

1. **`src/components/dashboard/ProfitabilityTable.tsx`** (line 95-101) — Admin Dashboard profitability table
2. **`src/components/ClientProfitTab.tsx`** (line 62-68) — Client Detail profit tab

Both already have `dateRange` props available. The `ProfitLossWidget.tsx` and `FinanceDashboard.tsx` are already fixed.

## Changes

### Both files — Replace simple WAC with cascading fallback

Replace the current pattern:
```ts
let totalBdt = 0, totalUsd = 0;
for (const p of (purchasesRes.data ?? []) as any[]) {
  totalBdt += Number(p.bdt_amount_paid);
  totalUsd += Number(p.usd_received);
}
const wac = totalUsd > 0 ? totalBdt / totalUsd : 128;
```

With the cascading pattern (same as ProfitLossWidget):
```ts
const calcWac = (data: any[] | null) => {
  let bdt = 0, usd = 0;
  for (const p of (data ?? [])) { bdt += Number(p.bdt_amount_paid); usd += Number(p.usd_received); }
  return usd > 0 ? bdt / usd : 0;
};

// 1. Try date-range filtered
let rangePurchases = purchasesRes.data;
if (dateRange) {
  const { data: filtered } = await supabase.from("usd_purchases")
    .select("bdt_amount_paid, usd_received")
    .gte("date", format(dateRange.from, "yyyy-MM-dd"))
    .lte("date", format(dateRange.to, "yyyy-MM-dd"));
  rangePurchases = filtered;
}
let wac = calcWac(rangePurchases);

// 2. Fallback: current month
if (wac === 0) {
  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const { data: monthPurchases } = await supabase.from("usd_purchases")
    .select("bdt_amount_paid, usd_received")
    .gte("date", format(firstOfMonth, "yyyy-MM-dd"))
    .lte("date", format(today, "yyyy-MM-dd"));
  wac = calcWac(monthPurchases);
}

// 3. Fallback: all-time
if (wac === 0) {
  wac = calcWac(purchasesRes.data);
}
```

### Files Modified
- `src/components/dashboard/ProfitabilityTable.tsx`
- `src/components/ClientProfitTab.tsx`

