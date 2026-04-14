

## Plan: Add Loan-Funded Option to Add Funds with KPI on Cash Flow Page

### What Changes

**1. AddFunds page** (`src/pages/AddFunds.tsx`)
- Add a "Funded by Loan" toggle switch below the platform amounts section
- When enabled, show: source agency account selector, borrower name, expected return date fields
- On submit: after creating the credit transactions, also insert a `cash_withdrawals` record with category `business_loan` and debit the selected agency account balance
- This makes the loan automatically appear in Cash Flow > Withdrawals tab with the existing "Return" button

**2. DepositFundsDialog** (`src/components/DepositFundsDialog.tsx`)
- Same "Funded by Loan" toggle with agency account/borrower/expected return date fields
- Same dual-insert logic: creates the payment request AND a `cash_withdrawals` record when loan is toggled on

**3. Cash Flow page KPI** (`src/pages/CashFlowManagement.tsx`)
- Replace the conditional "Outstanding Withdrawals" card with a permanent **"Loan Outstanding"** KPI card that shows the total of all active/partially-returned loans (`amount_bdt - returned_bdt` where `status != 'fully_returned'`)
- This KPI is always visible (not hidden when zero) so you can always see your loan position
- Add a count of active loans beneath the amount

**No database changes needed** — the existing `cash_withdrawals` and `cash_withdrawal_returns` tables already support loan categories (`business_loan`, `personal_loan`, etc.) with the Return flow fully functional.

### Technical Detail

```text
AddFunds submit flow (when loan enabled):
1. Insert credit transactions (existing)
2. Insert cash_withdrawals { category: "business_loan", from_account_id, borrower_name, amount_bdt: totalAmount * exchange_rate_estimate, ... }
3. Debit agency account via adjustAccountBalance()

DepositFundsDialog submit flow (when loan enabled):
1. Insert payment_request (existing)  
2. Insert cash_withdrawals record
3. Debit agency account
```

### Files Changed
| Action | File |
|--------|------|
| Modify | `src/pages/AddFunds.tsx` — add loan toggle + account/borrower fields + dual insert |
| Modify | `src/components/DepositFundsDialog.tsx` — add loan toggle + same logic |
| Modify | `src/pages/CashFlowManagement.tsx` — enhance KPI to show "Loan Outstanding" permanently |

