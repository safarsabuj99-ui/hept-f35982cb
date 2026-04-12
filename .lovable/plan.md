

## Plan: Upgrade Platform Finance Hub to Match Agency Finance System

The agency finance system has rich operational features (date filters, account management, USD inventory, cash flow tracking, withdrawals/loans, activity feeds). The platform finance currently has only basic charts and tables. Here's the upgrade plan to bring parity.

### Tab 1: P&L Overview — Add Date Filtering & Richer Layout
**Current**: Static totals from all subscriptions, no date filtering, no WAC concept.
**Upgrade**:
- Add `DateRangeFilter` component (same as agency P&L)
- Filter invoices and expenses by date range
- Add period-aware KPI labels ("Today", "This Month", etc.)
- Add P&L Summary card (Revenue / Expenses / Gross Profit in 3-column layout)
- Keep existing Monthly P&L chart and Revenue by Plan chart

**File**: `src/components/platform-finance/FinanceOverview.tsx`

### Tab 2: Revenue Analytics — No Changes Needed
Already comprehensive with MRR/ARR/ARPA/Churn/NRR/MRR Trend/Churned Agencies. Stays as-is.

### Tab 3: Expenses — Add Date Filter, Pie Chart, Pagination, Account Integration
**Current**: Basic add/delete with trend chart and category pie. No date filter, no pagination, no "paid from account" tracking.
**Upgrade**:
- Add `DateRangeFilter` for filtering by period
- Add summary KPI cards (Total / OpEx / Owner's Draw style) at top
- Add `TablePagination` for the expense list
- Add mobile card view (same pattern as agency ExpenseManager)
- Add "Paid From Account" concept — requires new `paid_from_account_id` column on `platform_expenses`
- Realtime subscription for live updates

**File**: `src/components/platform-finance/ExpensesTab.tsx`
**Migration**: Add `paid_from_account_id` column to `platform_expenses`

### Tab 4: Cash Flow — Full Rebuild to Match Agency Cash Flow
**Current**: Basic collections vs outflows chart, receivable aging, upcoming renewals. No accounts, no transfers, no activity feed, no withdrawals.
**Upgrade**: Complete rebuild matching agency `CashFlowManagement.tsx`:
- **Platform Accounts**: Add/manage platform-level bank/MFS/cash accounts (new `platform_accounts` table)
- **Fund Transfers**: Transfer BDT between platform accounts (new `platform_fund_transfers` table)
- **Activity Feed**: Unified feed of invoice payments, expenses, transfers (with pagination)
- **Account Balance Cards**: Show all accounts with type icons and balances
- Keep existing Receivable Aging and Upcoming Renewals sections
- Add Liquid Fund support for platform (reuse pattern)

**New Tables**:
```sql
CREATE TABLE platform_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'Bank',
  account_number TEXT,
  current_balance_bdt NUMERIC NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- RLS: platform_owner only

CREATE TABLE platform_fund_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_account_id UUID NOT NULL,
  to_account_id UUID NOT NULL,
  amount_bdt NUMERIC NOT NULL,
  note TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- RLS: platform_owner only
```

**File**: `src/components/platform-finance/CashFlowTab.tsx` (full rewrite)

### Files Changed
- `src/components/platform-finance/FinanceOverview.tsx` — Add date filter, richer KPI layout
- `src/components/platform-finance/ExpensesTab.tsx` — Add date filter, pagination, mobile view, account tracking
- `src/components/platform-finance/CashFlowTab.tsx` — Full rebuild with accounts, transfers, activity feed
- `src/lib/adjustPlatformAccountBalance.ts` — New utility (mirrors `adjustAccountBalance` for platform accounts)
- **Migration** — Add `paid_from_account_id` to `platform_expenses`, create `platform_accounts` and `platform_fund_transfers` tables with RLS

