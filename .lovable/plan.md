

# Admin-Only Inter-Platform Balance Transfer

## Overview
Only admins can transfer USD between a client's platform wallets (Meta, TikTok, Google). The conversion uses the client's per-platform rates:

```text
Source USD --[source rate]--> BDT --[dest rate]--> Destination USD
```

Example: Transfer $10 from Google (rate 155) to TikTok (rate 150):
- $10 x 155 = 1,550 BDT
- 1,550 / 150 = $10.33 credited to TikTok

---

## Bug Fix: Pricing Key Mismatch

The ClientDetail Pricing tab currently saves rates under `platform_rates`, but the approval flow reads from `flat_rates`. This creates the "Default Rate 120" problem whenever pricing is re-saved. Both keys need to be standardized to `flat_rates`.

**File:** `src/pages/ClientDetail.tsx` (line 216)
- Change `platform_rates` to `flat_rates` in the `handleSavePricing` function

---

## New Files

### 1. PlatformTransferDialog Component
`src/components/PlatformTransferDialog.tsx`

A dialog for admins only, with:
- Client ID passed as prop
- "From Platform" dropdown (Meta / TikTok / Google) showing current balance
- "To Platform" dropdown (excludes selected source)
- USD amount input validated against source balance
- Live conversion preview: source rate, BDT amount, destination rate, final USD
- Submit calls the new edge function

### 2. Edge Function: platform-transfer
`supabase/functions/platform-transfer/index.ts`

Server-side logic:
1. Validate caller is admin (check user_roles)
2. Fetch client's `pricing_config.flat_rates` for source and destination rates
3. Calculate source platform balance from transactions; reject if insufficient
4. Compute: `bdt = usd * source_rate`, then `dest_usd = bdt / dest_rate`
5. Insert 2 transactions:
   - Debit on source platform (original USD amount)
   - Credit on destination platform (converted USD amount)
6. Return conversion details

---

## Modified Files

### ClientDetail.tsx (Admin View)
- Add a "Transfer" button in the Transactions tab, near the platform balance cards
- Opens PlatformTransferDialog with the client's user ID
- Fix `handleSavePricing` to save under `flat_rates` key instead of `platform_rates`

### supabase/config.toml
- Add `[functions.platform-transfer]` with `verify_jwt = false`

---

## Summary

| File | Change |
|------|--------|
| `src/components/PlatformTransferDialog.tsx` | New -- transfer dialog with conversion preview |
| `supabase/functions/platform-transfer/index.ts` | New -- secure server-side transfer logic |
| `src/pages/ClientDetail.tsx` | Add Transfer button + fix `platform_rates` to `flat_rates` |
| `supabase/config.toml` | Register new edge function |

No database schema changes needed. Uses existing `transactions` table with `platform` field.
