

# Platform Rate Selector for Payment Approval

## What Changes

When you click "Approve" on a payment request, the pop-up will now show a **rate selector** where you can choose which dollar rate to apply:

- **Meta Rate** (e.g., 145 BDT per USD)
- **TikTok Rate** (e.g., 150 BDT per USD)  
- **Google Rate** (e.g., 155 BDT per USD)
- **Custom Exchange Rate** (if set for the client)
- **Default Rate** (global default, currently 120 BDT)

The rates are pulled from the client's `pricing_config` in the profiles table. As you select a rate, the USD credit amount recalculates instantly so you see exactly how much will be credited before confirming.

## Technical Details

### 1. Update `src/pages/PaymentRequests.tsx`
- When opening the approval modal, fetch the client's `pricing_config` (which contains `rates.meta`, `rates.tiktok`, `rates.google`) along with `custom_exchange_rate`
- Add radio buttons or a dropdown in the approval modal to pick the rate source
- Recalculate `USD = amount_bdt / selected_rate` live as the admin switches rates
- Pass the selected rate to the edge function

### 2. Update `supabase/functions/approve-payment/index.ts`
- Accept an optional `selected_rate` parameter in the request body
- If `selected_rate` is provided, use it directly instead of the auto-lookup logic
- This keeps backward compatibility (if no rate is sent, the old logic still works)

### No Database Changes Needed
All pricing data already exists in the `profiles.pricing_config` JSONB field.

