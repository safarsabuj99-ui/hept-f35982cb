

## Smart Multi-Platform Payment Approval & History

### Problem
When a client deposits for 3 platforms (Meta, TikTok, Google), the approval dialog shows only 1 platform selector and 1 rate picker. The admin must pick a single rate for the entire payment, even though each platform has a different billing rate. Payment history also doesn't show which platforms were paid for.

### Changes

**1. Approval Dialog — Per-Platform Rate Selection (PaymentRequests.tsx)**

When `platform_amounts` exists on a payment request, replace the current single-platform/single-rate UI with:

- Show a breakdown table: each platform row with its BDT amount, auto-matched rate, and calculated USD
- Each platform's rate is auto-selected from the client's `pricing_config` (Meta Rate for Meta, TikTok Rate for TikTok, etc.)
- Admin can override any individual rate if needed
- Show per-platform USD + grand total USD at the bottom
- Remove the single "Platform" dropdown and single "Select Dollar Rate" radio group for multi-platform payments (keep them for legacy single-platform payments)

**2. Edge Function — Per-Platform Rates (approve-payment/index.ts)**

Update to accept `platform_rates` (e.g. `{ meta: 145, tiktok: 150, google: 155 }`) instead of a single `selected_rate`. When `platform_amounts` exists:
- Use each platform's specific rate for USD conversion
- Calculate `final_amount_usd` as the sum of all per-platform USD amounts
- Store the rate map in `exchange_rate_snapshot` as JSON
- Each transaction gets its own exchange rate

**3. Payment Request Interface — Add `platform_amounts` to display**

Update the PaymentRequest interface and table/card views to:
- Fetch and display `platform_amounts` from the payment request
- Show platform badges (e.g. "Meta ৳5,000 · TikTok ৳5,000 · Google ৳5,000") in the Platform column instead of a single platform name
- In payment history, show the per-platform breakdown with rates used

**4. Data Flow Summary**

```text
Client deposits ৳15,000 for Meta + TikTok + Google
  └─ platform_amounts: { meta: 5000, tiktok: 5000, google: 5000 }

Admin opens approval:
  ├─ Meta:   ৳5,000 ÷ ৳145 = $34.48  (auto-matched)
  ├─ TikTok: ৳5,000 ÷ ৳150 = $33.33  (auto-matched)
  ├─ Google: ৳5,000 ÷ ৳155 = $32.26  (auto-matched)
  └─ Total Credit: $100.07

Edge function creates 3 transactions, each with correct rate.
Payment history shows: "Meta · TikTok · Google" with breakdown.
```

### Files Modified
- `src/pages/PaymentRequests.tsx` — Revamp approval dialog UI for multi-platform; update history display
- `supabase/functions/approve-payment/index.ts` — Accept per-platform rates map; use per-platform conversion

