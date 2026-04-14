

## Plan: Loan-Funded Liquid Fund Tracking with Repayment System

### What You Get

1. **Enhanced "Add Fund" dialog** — When source is "Loan", new fields appear: Lender Name, Expected Return Date
2. **New "Liquid Fund Loans" tab** alongside Withdrawals — shows all loan-funded liquid funds with status tracking (Active / Partially Returned / Fully Returned), overdue highlighting
3. **Loan Repayment dialog** — Record partial/full returns against loan entries (debits from selected account, updates loan status)
4. **"Loan Outstanding" KPI card** on Cash Flow tab — shows total unreturned loan amount across both withdrawal loans AND liquid fund loans

### Database Changes (Migration)

**New table: `liquid_fund_loans`**
```text
id              uuid PK
liquid_fund_id  uuid FK → liquid_fund_entries.id
to_account_id   uuid FK → agency_accounts.id
amount_bdt      numeric
returned_bdt    numeric (default 0)
status          withdrawal_status (reuse existing enum: active/partially_returned/fully_returned)
lender_name     text
date            date
expected_return_date  date (nullable)
note            text (nullable)
created_by      uuid
org_id          uuid (nullable, FK → organizations)
created_at      timestamptz
```

**New table: `liquid_fund_loan_returns`** (mirrors `cash_withdrawal_returns`)
```text
id              uuid PK
loan_id         uuid FK → liquid_fund_loans.id
amount_bdt      numeric
to_account_id   uuid FK → agency_accounts.id (account debited for repayment)
date            date
note            text (nullable)
created_by      uuid
org_id          uuid (nullable)
created_at      timestamptz
```

**RLS policies** on both tables scoped to `org_id = get_user_org_id(auth.uid())`.

**Auto-set org_id triggers** on both tables using the standard cascading fallback.

### UI Changes (CashFlowManagement.tsx)

1. **Add Fund dialog** — When source = "Loan":
   - Show "Lender Name" input
   - Show "Expected Return Date" date picker
   - On submit: insert `liquid_fund_entries` + insert `liquid_fund_loans` + credit account balance

2. **New "Loans (N)" tab** next to "Withdrawals (N)" — Table showing:
   - Lender Name, Amount, Returned, Remaining, Status badge, Expected Date (overdue in red)
   - "Record Return" button per row → opens return dialog (amount, to account, date, note)

3. **Loan Outstanding KPI** — New card next to "Outstanding Withdrawals":
   - Sums `amount_bdt - returned_bdt` from both `cash_withdrawals` (existing) and `liquid_fund_loans` (new) where status ≠ fully_returned
   - Or split into two: "Withdrawal Outstanding" + "Loan Outstanding"

4. **Recent Activity feed** — Include loan repayments as "in" type entries

### Files Changed

| Action | File |
|--------|------|
| Migration | Create `liquid_fund_loans` + `liquid_fund_loan_returns` tables, RLS, triggers |
| Modify | `src/pages/CashFlowManagement.tsx` — Add loan fields to Add Fund dialog, new Loans tab, return dialog, KPI card |

