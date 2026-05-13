## Cash Flow Closing System

Mirrors the proven USD Inventory close pattern, but operates on total BDT across all active `agency_accounts` and layers in Net Profit from the existing ERP engine.

### What you'll see on /admin/cash-flow (new "Period Tracker" card at the top)

```text
┌──────────────────────────────────────────────────────────────┐
│  Cash Flow Period          Period start: 12 May 2026         │
│                            (Last close: 30 Apr 2026)         │
│                                                              │
│  Opening Balance      ৳ 1,250,000                            │
│  + Take-home Profit   ৳   180,500   (since period start)     │
│  = Expected Balance   ৳ 1,430,500                            │
│                                                              │
│  Current Balance      ৳ 1,425,000   (sum of all accounts)    │
│  Variance             ৳    -5,500   (unexplained)            │
│                                                              │
│              [  Close Period & Carry Forward  ]              │
└──────────────────────────────────────────────────────────────┘
```

### Close flow (dialog)

1. Click **Close Period & Carry Forward**
2. Dialog shows: Current Balance, Take-home Profit since open, suggested new Opening Balance (= Current Balance, editable)
3. Optional note (e.g. "April month-end close")
4. Confirm → snapshot saved → new period starts from edited opening balance
5. Account balances are **never modified** (snapshot-only, non-destructive)

### Take-home profit definition

Reuses the existing ERP engine (`src/lib/finance/aggregate.ts`):
**Net Profit = Revenue − WAC (ad cost in BDT) − OpEx**, computed for the date range `[last_close_date, today]`. Same formula already shown in P&L Overview, so numbers reconcile.

---

## Technical Plan

### 1. New table: `cash_flow_snapshots`

| Column | Type | Notes |
|---|---|---|
| id | uuid | pk |
| org_id | uuid | RLS isolation (BEFORE INSERT trigger sets it) |
| snapshot_date | timestamptz | when closed |
| opening_balance_bdt | numeric | balance at start of the period that was just closed |
| closing_balance_bdt | numeric | sum of agency_accounts at close time |
| take_home_profit_bdt | numeric | Net Profit during period |
| carry_forward_bdt | numeric | editable opening for the NEW period |
| variance_bdt | numeric | closing − (opening + profit) |
| note | text | optional |
| created_by | uuid | admin who closed |

RLS: admin full access scoped by `org_id = get_user_org_id(auth.uid())`. No client/manager access.

### 2. Frontend changes (only `src/pages/CashFlowManagement.tsx`)

- New `<CashFlowPeriodCard />` placed at the top, above the existing KPI grid
- Fetches:
  - Latest snapshot → gives `period_start_date` + `carry_forward_bdt` (= opening)
  - If none exists → opening = sum of current account balances, period_start = first account's `created_at`
  - Current total balance from already-loaded `accounts` state
  - Take-home profit via existing aggregate helper for `[period_start, now]`
- Close dialog: editable carry-forward number input, note, confirm button
- On submit: insert into `cash_flow_snapshots`, refetch, toast success

### 3. No changes to

- `agency_accounts` balances (snapshot is read-only history)
- ERP / P&L logic (we just consume it)
- Platform-side `CashFlowTab.tsx` (this is admin-only)

### Acceptance criteria

- First-time view shows current totals as opening with no "last close" line
- After clicking close, the period card resets: new period start = today, opening = the value you typed, profit counter restarts at ৳0
- Closing again later still shows previous close date as a secondary badge
- Variance highlights in red when |variance| > 1% of opening
- Existing accounts, transfers, withdrawals, loans tabs untouched
