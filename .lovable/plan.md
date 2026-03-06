

# Auto-Select Platform Rate & Allow Platform Override in Approval Modal

## Problem
When approving a payment request, the modal only shows a "Default Rate" instead of auto-selecting the client's platform-specific exchange rate from their pricing config. Additionally, if the client chose the wrong platform, there's no way to change it during approval.

## Current Behavior
The code at line 114 already attempts to match the platform rate, but if rates aren't found in `flat_rates`, it falls back to a single "Default Rate: ৳120". The platform is displayed as a read-only badge.

## Plan

### 1. Make Platform Editable in Approval Modal
**`src/pages/PaymentRequests.tsx`**
- Replace the read-only platform badge in the approval summary with a `Select` dropdown (Meta / TikTok / Google)
- Pre-fill with the client's requested platform
- When the admin changes the platform, auto-update `selectedRateKey` to match the new platform's rate
- Pass the (possibly overridden) platform to the edge function so the transaction records the correct platform

### 2. Ensure Rate Auto-Selection Works
- When platform changes in the dropdown, find the matching rate option and auto-select it
- Keep the radio group visible so admin can still manually pick a different rate if needed
- Add a visual indicator showing which rate matches the selected platform

### 3. Update Edge Function to Accept Platform Override
**`supabase/functions/approve-payment/index.ts`**
- Accept an optional `platform_override` field in the request body
- Use it (if provided) instead of `pr.platform` when recording the transaction description and platform field

| File | Change |
|------|--------|
| `src/pages/PaymentRequests.tsx` | Platform dropdown in approval modal, auto-select matching rate on change |
| `supabase/functions/approve-payment/index.ts` | Accept `platform_override` param, use it in transaction record |

