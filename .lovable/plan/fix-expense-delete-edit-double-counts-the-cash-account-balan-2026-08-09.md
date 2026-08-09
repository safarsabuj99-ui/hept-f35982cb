# Fix: Expense delete/edit double-counts the cash account balance

## What I found

Your 6 August expense of ৳17,000 from the cash account behaved like this:

- Adding it: balance 17,000 → 0. Correct.
- Deleting it: balance 0 → 34,000. Wrong — it gave the money back twice.

Cause (confirmed in the database and code): the balance is adjusted in two places at once.

1. The database has a trigger (`sync_agency_expense_account_balance`) that already handles INSERT, UPDATE and DELETE — it subtracts on insert, and refunds on delete/edit.
2. The Expense Manager page *also* manually adjusts the account balance after an edit or delete (`adjustAccountBalance`).

So creating an expense is correct (the page does not adjust manually there), but deleting refunds twice (17,000 + 17,000 = 34,000), and editing an amount or switching accounts also double-applies the change.

The Cash Flow page's transfer-fee expense is already written correctly — it relies on the trigger only — so this bug is isolated to the Expense Manager page.

## The fix

1. Make the database trigger the single source of truth for expense-driven balance changes. Remove the manual balance adjustments from the Expense Manager edit and delete flows.
2. Refresh accounts after the operation so the UI shows the trigger's result immediately.
3. Correct the current wrong balance on the cash account (MD SABUJ MIAH) by subtracting the extra ৳17,000 that was refunded twice, so it reflects reality again.
4. Add a guard so this class of bug cannot come back: a short comment plus a runtime-safe rule that all `agency_expenses` writes go through insert/update/delete only, with no client-side balance math.

## Technical details

- File: `src/pages/ExpenseManager.tsx`
  - Remove the `adjustAccountBalance` calls in the update branch (old-account refund + new-account debit) and in `confirmDelete`.
  - Drop the now-unused import.
- No schema change needed; `sync_agency_expense_account_balance` already covers INSERT/UPDATE/DELETE including account switches.
- Data correction: one balance update on the affected agency account to remove the duplicated ৳17,000 refund.

## Verification

- Re-check the account balance value after the correction.
- Add a test expense, edit its amount, then delete it, and confirm the balance returns exactly to its starting value.
