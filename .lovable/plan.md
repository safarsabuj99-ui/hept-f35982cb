
## Plan: Fix All Finance RLS Insert Bugs Systematically

### What I found
This is not just one bug in “Add Liquid Fund”. It’s a broader pattern:

```text
Multi-tenant RLS now requires:
  org_id = get_user_org_id(auth.uid())

But several finance forms still insert rows without org_id.
Result:
  "new row violates row-level security policy"
```

The screenshot confirms the current visible failure is on:
- `liquid_fund_entries`

From the codebase, the same risk exists in these admin finance flows:
- `liquid_fund_entries` in `src/pages/CashFlowManagement.tsx`
- `fund_transfers` in `src/pages/CashFlowManagement.tsx`
- `cash_withdrawals` in `src/pages/CashFlowManagement.tsx`
- `cash_withdrawal_returns` in `src/pages/CashFlowManagement.tsx`
- `agency_accounts` create/update paths in `src/pages/CashFlowManagement.tsx` / `src/lib/adjustAccountBalance.ts`
- `agency_expenses` in `src/pages/ExpenseManager.tsx`
- `usd_purchases` in `src/pages/WalletInventory.tsx`
- `usd_manual_spends` in `src/pages/WalletInventory.tsx`
- `usd_inventory_snapshots` in `src/pages/WalletInventory.tsx`

### Root cause
A previous fix only covered:
- `payment_requests`
- `transactions`

But the same org-scoped RLS policy was also applied to many finance tables. Their UI insert payloads still do not consistently include `org_id`, and there is no proven complete trigger coverage for those tables.

So the app has:
- partial backend hardening
- partial frontend payload fixes
- multiple remaining broken write paths

### Smart fix strategy
Use a two-layer fix so this problem does not keep coming back.

#### 1. Backend hardening for every affected finance table
Create one migration that:
- reuses or extends the org auto-population trigger function
- adds `BEFORE INSERT` triggers for all org-scoped finance tables missing them:
  - `agency_accounts`
  - `fund_transfers`
  - `liquid_fund_entries`
  - `cash_withdrawals`
  - `cash_withdrawal_returns`
  - `agency_expenses`
  - `usd_purchases`
  - `usd_manual_spends`
  - `usd_inventory_snapshots`

This ensures every new row gets:
- `org_id = get_user_org_id(auth.uid())`
when frontend payloads forget it.

#### 2. Frontend defensive fixes
Update the finance pages to explicitly pass `org_id` from the logged-in admin profile:
- `src/pages/CashFlowManagement.tsx`
- `src/pages/ExpenseManager.tsx`
- `src/pages/WalletInventory.tsx`

This gives:
- immediate correctness in UI writes
- clearer debugging
- protection even before trigger logic runs

#### 3. Tighten account-balance update flow
Review `adjustAccountBalance` usage because balance updates depend on `agency_accounts` being accessible and properly org-scoped.
I’ll make sure:
- new account creation carries org_id
- balance updates still match the user’s org
- transfer/withdraw/return flows don’t partially succeed and leave inconsistent state

#### 4. Verify existing finance data
Run read-only checks to confirm whether legacy finance rows still have `NULL org_id`.
If any do, include a targeted backfill in the migration for affected finance tables only.

### Implementation details
#### Files to update
- `src/pages/CashFlowManagement.tsx`
- `src/pages/ExpenseManager.tsx`
- `src/pages/WalletInventory.tsx`
- new migration in `supabase/migrations/...sql`

#### Migration will do
- create safe reusable org-fill trigger function if needed
- attach triggers to all affected finance tables
- optionally backfill any lingering `NULL org_id` finance rows
- avoid changing reserved schemas
- keep RLS policies intact, but make inserts compliant

### Why this is the right approach
If I only patch `liquid_fund_entries`, you will keep hitting the same bug in the next button:
- add expense
- buy USD
- transfer fund
- withdraw
- return withdrawal
- snapshot inventory

This plan fixes the whole class of bug, not just today’s visible error.

### Expected outcome
After implementation:
- Add Liquid Fund works
- other finance create flows work
- org isolation remains secure
- future finance rows are automatically assigned to the correct agency
- fewer repeat RLS issues across the admin finance module

### Validation after implementation
I will verify these flows end-to-end:
1. Add Liquid Fund
2. Create Agency Account
3. Transfer Between Accounts
4. Record Withdrawal
5. Record Withdrawal Return
6. Add Expense
7. Record USD Purchase
8. Record USD Manual Spend
9. Save USD Opening/Closing Snapshot

### Technical note
The current migration history shows org-scoped RLS was expanded broadly, but trigger coverage was only added for `payment_requests` and `transactions`. The finance module still contains several insert payloads with no `org_id`, which is the main reason these bugs are recurring.
