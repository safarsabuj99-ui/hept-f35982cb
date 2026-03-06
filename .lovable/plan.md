

# Per-Ad-Account BDT Exchange Rate

## Problem
Currently, when a BDT-currency ad account syncs data, the system uses a **single global exchange rate** from the `settings` table. There is no way to set an exchange rate per ad account. Additionally, the Deep Dive sync stores raw spend values without any BDT-to-USD conversion, so BDT amounts appear as-is in reports instead of being converted to USD.

## Plan

### 1. Database: Add `exchange_rate` column to `ad_accounts`
Add a nullable `exchange_rate numeric` column to `ad_accounts`, defaulting to `NULL`. When set on a BDT account, this rate will be used for conversion. If null, falls back to the global `settings.exchange_rate`.

### 2. UI: Show exchange rate field when currency is BDT

**`src/pages/AdAccounts.tsx`** (Create dialog):
- Add an `exchange_rate` field to the form state
- Conditionally render an "Exchange Rate (BDT→USD)" input when `account_currency === "BDT"`
- Include the value in the create payload

**`src/pages/AdAccountDetail.tsx`** (Detail/edit view):
- Add `exchangeRate` state, load from account data
- Show the exchange rate input field only when currency is BDT
- Save it alongside other account fields

### 3. Sync Functions: Use per-account rate

**`supabase/functions/sync-fast-lane/index.ts`**:
- Read account's `exchange_rate` from the `ad_accounts` select query
- For BDT accounts: use `account.exchange_rate ?? globalExchangeRate` instead of just the global rate

**`supabase/functions/sync-deep-dive/index.ts`**:
- Read account's `exchange_rate` and `account_currency` from the select query
- After fetching raw spend from the platform, if the account is BDT, convert spend to USD using the per-account rate before storing in `daily_metrics`
- This ensures all `daily_metrics.spend` values are in USD, so reports display correctly

### 4. Flow Summary

```text
BDT Ad Account (exchange_rate = 120)
  ↓
Platform returns spend: ৳12,000
  ↓
Sync converts: 12000 / 120 = $100 USD
  ↓
daily_metrics.spend = 100 (USD)
  ↓
Reports show: $100
```

| File | Change |
|------|--------|
| Migration | Add `exchange_rate numeric` to `ad_accounts` |
| `src/pages/AdAccounts.tsx` | Exchange rate input in create dialog (BDT only) |
| `src/pages/AdAccountDetail.tsx` | Exchange rate input in detail view (BDT only) |
| `supabase/functions/sync-fast-lane/index.ts` | Use per-account rate for BDT conversion |
| `supabase/functions/sync-deep-dive/index.ts` | Convert BDT spend to USD using per-account rate |

