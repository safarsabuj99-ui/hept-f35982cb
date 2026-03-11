

# Add BDT Negative Balance to Dashboard Hero

## Problem
The client dashboard hero section shows "Available Balance" in USD only. When the balance is negative, the client needs to see the equivalent BDT (৳) amount based on their per-platform rates from `pricing_config.flat_rates`.

## Plan

### File: `src/pages/ClientDashboard.tsx`

1. **Fetch `pricing_config`** from the `profiles` table (same pattern as `ClientWallet.tsx` line 41-43) — add state + useEffect
2. **Compute platform balances** from transactions (credits - debits per platform: meta, tiktok, google)
3. **Calculate `totalNegativeBdt`** — when total balance < 0, sum each negative platform balance × its rate from `pricing_config.flat_rates` (fallback 120)
4. **Display BDT below USD** in the hero balance card (lines 238-245) — only when balance is negative, show `৳X,XXX.XX` in a smaller line beneath the USD amount, styled with `text-red-300` to indicate debt

### Code Change (Hero Balance Card)
```tsx
<p className="text-2xl md:text-4xl font-bold font-mono text-primary-foreground">
  {fmt(balance)}
</p>
{balance < 0 && totalNegativeBdt > 0 && (
  <p className="text-sm font-mono text-red-300 mt-0.5">
    ৳{totalNegativeBdt.toLocaleString("en-US", { minimumFractionDigits: 2 })}
  </p>
)}
```

### No new files — single file edit to `src/pages/ClientDashboard.tsx`

