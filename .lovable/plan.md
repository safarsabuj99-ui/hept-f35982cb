

## Temporary Withdrawal / Loan Tracker for Cash Flow

### What This Is
A loan/withdrawal tracking system where money temporarily leaves your cash flow (personal loan, business loan, etc.) and comes back later. These are **not expenses** — they don't affect P&L calculations.

### Database: New `cash_withdrawals` Table

```sql
CREATE TYPE withdrawal_status AS ENUM ('active', 'partially_returned', 'fully_returned');
CREATE TYPE withdrawal_category AS ENUM ('personal_loan', 'business_loan', 'others_loan', 'advance', 'other');

CREATE TABLE cash_withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_account_id UUID NOT NULL,        -- which agency account funds left from
  amount_bdt NUMERIC NOT NULL,
  returned_bdt NUMERIC NOT NULL DEFAULT 0,
  category withdrawal_category NOT NULL,
  status withdrawal_status NOT NULL DEFAULT 'active',
  borrower_name TEXT NOT NULL DEFAULT '',
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  expected_return_date DATE,
  note TEXT,
  created_by UUID NOT NULL,
  org_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE cash_withdrawals ENABLE ROW LEVEL SECURITY;
-- Admin full access policy
-- Add updated_at trigger
```

A separate `cash_withdrawal_returns` table to track partial/full repayments:

```sql
CREATE TABLE cash_withdrawal_returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  withdrawal_id UUID NOT NULL REFERENCES cash_withdrawals(id) ON DELETE CASCADE,
  amount_bdt NUMERIC NOT NULL,
  to_account_id UUID NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  note TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE cash_withdrawal_returns ENABLE ROW LEVEL SECURITY;
```

### UI Changes in `CashFlowManagement.tsx`

1. **New "Withdraw" button** in the top action bar (alongside Add Fund, Transfer, Add Account)

2. **Withdraw Dialog**: Category selector (Personal Loan, Business Loan, Others Loan, Advance, Other), borrower name, amount, from-account, expected return date, note

3. **New tab "Withdrawals"** in the Tabs section showing:
   - Active withdrawals with outstanding amounts, category badges, overdue highlighting
   - "Record Return" button per row to log partial/full repayments
   - Status auto-updates: active → partially_returned → fully_returned

4. **Return Dialog**: Amount input (max = remaining), to-account selector, date, note

5. **Balance integration**: Withdrawing deducts from `agency_accounts.current_balance_bdt`; returns add back

6. **Activity feed**: Withdrawals and returns appear in Recent Activity (type "out"/"in" with "Withdrawal:" / "Return:" prefix)

7. **Summary card**: Show "Outstanding Withdrawals: ৳X" near total liquid funds — this money is technically owed back

8. **Realtime**: Subscribe to both new tables for live updates

### Key Design Decisions
- Withdrawals are completely separate from `agency_expenses` — **zero impact on P&L/OpEx**
- Partial returns supported via a dedicated returns table (audit trail)
- Overdue visual indicators when `expected_return_date < today` and status != `fully_returned`
- Account balances stay accurate: debit on withdraw, credit on return

### Files Modified
- **New migration**: Create `cash_withdrawals` and `cash_withdrawal_returns` tables with RLS
- **`src/pages/CashFlowManagement.tsx`**: Add Withdraw button/dialog, Returns dialog, Withdrawals tab, outstanding summary card

