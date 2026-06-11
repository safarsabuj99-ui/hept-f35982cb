# Auto-select Paid-To Account on Admin Approval

## Problem
Client picks "Paid To Account" (e.g. SABUJ Personal Bkash) when submitting a deposit. The value is correctly stored in `payment_requests.received_in_account_id`. But on the admin **Confirm Approval** dialog, "Received In Account" always shows "Select account (optional)" — admin has to pick it again, risk of crediting the wrong agency account.

## Root Cause
`src/pages/PaymentRequests.tsx` → `openConfirm()` does `setSelectedAccountId("")` unconditionally and never reads `request.received_in_account_id`.

## Fix (single-file, surgical)
In `openConfirm()`:
- Initialize `setSelectedAccountId(request.received_in_account_id ?? "")` instead of `""`.
- After agency accounts load, validate the pre-selected id still exists & is active; if not, fall back to empty and let admin choose (silent — no scary toast).

## UX polish in the Confirm dialog
- Show a small inline hint under the Select: **"Pre-filled from client's submitted account"** (muted text) when the value matches what the client submitted, so the admin knows it's an auto-suggestion they can override.
- If the client's submitted account is no longer active/exists, show an amber inline note: **"Client's selected account is no longer available — please choose one."**

## Files
- `src/pages/PaymentRequests.tsx` — only file changed.

## Out of Scope
- No backend / edge function changes (`approve-payment` already accepts `received_in_account_id`).
- No schema changes.
- No changes to the client-side deposit dialog.
