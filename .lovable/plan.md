

## Bug: Payment Due Widget Shows Incorrect BDT Value

### Root Cause

The Payment Due BDT calculation in `AdminDashboard.tsx` (line 223) reads pricing config incorrectly:

```js
// BUG: Only checks flat_rates, ignores platform_rates
const flatRates = pc?.flat_rates || {};
```

Your clients' `pricing_config` stores rates under `platform_rates` (e.g., `{platform_rates: {meta: 145, tiktok: 150, google: 150}}`), but this code only looks for `flat_rates`. Since `flat_rates` doesn't exist, it falls back to `{}`, and every platform rate becomes the hardcoded `120` fallback — producing wrong BDT totals.

Every other component in the project already handles both keys correctly:
```js
// Correct pattern used in ClientList, ProfitabilityTable, FinanceDashboard, etc.
const rates = pc?.flat_rates || pc?.platform_rates || { meta: 120, ... };
```

The same bug exists in `ClientDashboard.tsx` (line 156).

### Fix

**1. Create a shared utility function** (`src/lib/pricing.ts`) to eliminate this class of bug permanently:

```ts
export function getPlatformRates(pricingConfig: any): { meta: number; tiktok: number; google: number } {
  const rates = pricingConfig?.flat_rates || pricingConfig?.platform_rates || {};
  return {
    meta: Number(rates.meta) || 120,
    tiktok: Number(rates.tiktok) || 120,
    google: Number(rates.google) || 120,
  };
}
```

**2. Replace all inline rate lookups** across the codebase with this single function — ensuring no component can ever read the wrong key again.

### Files Changed

| File | Change |
|------|--------|
| `src/lib/pricing.ts` | New shared utility |
| `src/pages/AdminDashboard.tsx` | Use `getPlatformRates()` in Payment Due calculation |
| `src/pages/ClientDashboard.tsx` | Use `getPlatformRates()` in negative BDT calculation |
| `src/pages/ClientList.tsx` | Use `getPlatformRates()` (2 places) |
| `src/pages/FinanceDashboard.tsx` | Use `getPlatformRates()` |
| `src/pages/ClientWallet.tsx` | Use `getPlatformRates()` |
| `src/pages/PaymentRequests.tsx` | Use `getPlatformRates()` |
| `src/components/ProfitLossWidget.tsx` | Use `getPlatformRates()` |
| `src/components/dashboard/ProfitabilityTable.tsx` | Use `getPlatformRates()` |
| `src/components/ClientProfitTab.tsx` | Use `getPlatformRates()` |
| `src/components/PlatformTransferDialog.tsx` | Use `getPlatformRates()` |

This is a pure frontend fix — no database changes needed.

