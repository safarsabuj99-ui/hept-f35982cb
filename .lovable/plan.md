

# Fix: Show Platform in Approval Modal + Auto-Select Rate

## Problem
When a client submits a payment request with a platform (Meta/TikTok/Google), the approval modal doesn't display which platform the payment is for. The admin can't see the client's chosen platform and the rate isn't clearly auto-matched.

## Changes

### PaymentRequests.tsx -- Approval Modal
1. **Show platform in the summary section** -- Add a "Platform" row in the info card (between "Amount Sent" and "Method") showing the client's selected platform with a colored badge (e.g., "Meta", "TikTok", "Google")
2. **Highlight the auto-selected rate** -- The code already auto-selects the matching platform rate (line 114), but add a small note like "(matches request)" next to the auto-selected rate label so the admin knows why it was pre-selected
3. **If no platform was set** (old requests), show "Not specified" in the platform row

### Files Modified

| File | Change |
|------|--------|
| `src/pages/PaymentRequests.tsx` | Add platform display in approval modal summary; add "(matches request)" indicator on auto-selected rate |

No database or edge function changes needed -- the `platform` column already exists on `payment_requests` and the data is already being saved correctly from the deposit dialog.

