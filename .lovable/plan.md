

# Fix: Approval Modal Shows Default Rate Instead of Client's Actual Rates

## Problem
The client's per-platform rates (Meta: 145, TikTok: 150, Google: 155) are stored in `pricing_config.flat_rates`, but the approval modal code reads from `pricing_config.platform_rates` -- a key that doesn't exist. This causes it to always fall back to "Default Rate 120".

## Root Cause
In `PaymentRequests.tsx` line 103:
```text
const platformRates = pricingConfig?.platform_rates || {};  // WRONG key
```
The actual data structure is:
```text
{ "flat_rates": { "meta": 145, "tiktok": 150, "google": 155 }, "mode": "flat" }
```

## Fix
One line change in `src/pages/PaymentRequests.tsx` (line 103): read from `flat_rates` instead of `platform_rates`, with a fallback to `platform_rates` for safety.

```text
const platformRates = pricingConfig?.flat_rates || pricingConfig?.platform_rates || {};
```

This will correctly pick up the Meta: 145, TikTok: 150, Google: 155 rates that were set during client creation.

### Also fix in approve-payment Edge Function
The same wrong key is used in `supabase/functions/approve-payment/index.ts` (the fallback logic when no `selected_rate` is provided). Update to read `flat_rates` there too.

| File | Change |
|------|--------|
| `src/pages/PaymentRequests.tsx` | Line 103: Change `platform_rates` to `flat_rates` |
| `supabase/functions/approve-payment/index.ts` | Update fallback rate lookup to use `flat_rates` key |

No database changes needed.

