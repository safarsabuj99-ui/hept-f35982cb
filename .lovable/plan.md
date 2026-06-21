# Unify Payment Method + Paid To Account

## Goal
In the Deposit Funds dialog, remove the separate "Payment Method" dropdown and keep only **Paid To Account**. The payment method is auto-derived from the selected account (since each agency account already has a type: Cash / Bank / MFS, with the MFS provider in its name like "bKash – Personal").

No backend schema changes. `payment_method` column stays populated so approval, ledgers, reports, filters, and `approve-payment` edge function keep working unchanged.

## Scope (UI only, frontend)
File: `src/components/DepositFundsDialog.tsx`

1. Remove the standalone **Payment Method** `<Select>` block and its `method` state usage in the form.
2. Make **Paid To Account** required (it's currently optional).
3. Load agency accounts as today (`agency_accounts` where `is_active = true`), grouped by type in the dropdown:
   - Cash
   - Bank (list each bank account)
   - MFS (list each MFS account — bKash/Nagad/etc. by name)
4. On submit, derive `payment_method` from the chosen account:
   - `type = 'Bank'` → `"Bank"`
   - `type = 'Cash'` → `"Cash"`
   - `type = 'MFS'` → if account name contains "bkash" → `"bKash"`, contains "nagad" → `"Nagad"`, contains "rocket" → `"Rocket"`, contains "upay" → `"Upay"`, else fallback to the account name itself.
   - Helper lives inline in the dialog (small pure function).
5. Disable Submit until an account is selected (plus existing platform-amount validation).
6. Empty-state: if no active agency accounts exist, show a small inline hint ("Add an agency account in Finance → Wallet first") and keep submit disabled. No new route or creation flow added.

## What does NOT change
- DB schema, RLS, triggers — untouched.
- `payment_requests` insert payload still sends both `payment_method` and `received_in_account_id` (derived method preserves all downstream logic: approve-payment, cash-flow, reports, balance adjustments via `adjustAccountBalance`).
- `approve-payment` edge function — untouched.
- Other dialogs/pages that read `payment_method` — untouched.
- The admin client-side Deposit dialog is the only entry point modified; if `PaymentRequests.tsx` or other places have their own method picker we leave them alone in this pass (only `DepositFundsDialog.tsx` matches the screenshot).

## Verification
- Open Admin → Client → Deposit Funds: only one selector ("Paid To Account") appears between Platform Amounts and Payment Date.
- Selecting a Bank account → submit → row in `payment_requests` has `payment_method = 'Bank'` and correct `received_in_account_id`.
- Selecting an MFS account named "bKash Personal" → submit → `payment_method = 'bKash'`.
- Approve the request → balance updates on the chosen account (existing flow), cash-flow & reports show it under the right method bucket.
- No regressions in PaymentRequests list, finance dashboards, or approve-payment edge function.
