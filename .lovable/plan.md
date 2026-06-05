# Net BDT Balance — Per-Platform Rate Conversion

## What you want

Aggregate BDT line on the "Available Balance" card should be the **true net** across every platform, each converted at its **own** billing rate:

```
total_bdt = (meta_usd   × meta_rate)
          + (tiktok_usd × tiktok_rate)
          + (google_usd × google_rate)
```

Example from your screen:
- TikTok: +$9.86 × tiktok_rate
- Meta:   −$11.27 × meta_rate (≈ 132) → ≈ −৳1,487
- Google:  $0.00 × google_rate
- **Net BDT** = sum of the three (signed)

Display:
- If net ≥ 0 → show as positive green `৳…`
- If net < 0 → show as `-৳…` red (current style)

## What changes

### 1. `src/lib/walletBalance.ts` — new helper `computeNetBdt`
Add a function that takes `pricingConfig` + `WalletBalance` and returns the **signed** net BDT across all known platforms (meta/tiktok/google), using each platform's own rate from `getPlatformRates`. Untagged USD is converted at the highest configured rate (same fallback rule already used for debt).

`computeBdtDebt` stays as-is (still used elsewhere for debt-only displays); the new helper is for the aggregate balance card.

### 2. `src/pages/ClientWallet.tsx` — aggregate balance card
Replace the current `totalNegativeBdt` (which only sums negative buckets) with `computeNetBdt(...)`. Render rules on the main "Available Balance" card:

- Always show the BDT line under the USD figure (not only when negative).
- Sign-aware: positive → no minus, success color; negative → `-৳…`, destructive color.
- Per-platform mini-cards are unchanged (they already show each platform's own BDT correctly).

## Out of scope

- No DB / RLS / edge-function changes.
- No changes to `computeBdtDebt` consumers (admin dashboard, low-balance alerts) — those intentionally show debt, not net.
- No changes to platform transfer logic or pricing config.
