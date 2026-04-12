

## Plan: Optimize Wallet & USD Tab + Cash Flow Mobile Buttons

### Issues Identified

**1. Wallet & USD Tab (`WalletInventory.tsx`)**
- **Stale balance bug (line 233-239)**: "Buy USD" deducts from `paidFromAccountId` using stale local `agencyAccounts` state — same bug pattern we just fixed in ExpenseManager. Uses `acc.current_balance_bdt` from mount-time state instead of fresh DB read.
- **No account state refresh**: After recording a purchase, `agencyAccounts` is never re-fetched, so subsequent purchases overwrite each other's deductions.
- **Realtime channel doesn't refresh accounts**: The realtime subscription watches `usd_purchases` and `usd_inventory_snapshots` but never refreshes `agencyAccounts`.

**2. Cash Flow Mobile Buttons (`CashFlowManagement.tsx`)**
- Lines 495-690: Four action buttons (Withdraw, Add Fund, Transfer, Add Account) are stacked as `flex-col` with `w-full` on mobile — each button takes full width, pushing content far down the page. This is clunky on a 390px viewport.
- The buttons should be a compact 2x2 grid on mobile instead of a tall vertical stack.

### Changes

**File: `src/pages/WalletInventory.tsx`**

1. **Fix stale balance deduction** — Replace lines 233-239 (the `handleSubmit` account deduction) with `adjustAccountBalance(paidFromAccountId, -Number(bdtPaid))` to use fresh DB reads, matching the pattern already applied in ExpenseManager and CashFlowManagement.

2. **Add account refresh function** — Extract `agencyAccounts` fetch into a `fetchAgencyAccounts` callback. Call it after `handleSubmit` succeeds (after purchase recorded).

3. **Add `agency_accounts` to realtime channel** — Subscribe to changes on `agency_accounts` table so the UI stays fresh if balances change from other tabs (e.g., CashFlow).

**File: `src/pages/CashFlowManagement.tsx`**

4. **Optimize mobile button layout** — Change the action buttons container from `flex flex-col sm:flex-row` to `grid grid-cols-2 sm:flex sm:flex-row` so on mobile the 4 buttons form a compact 2×2 grid instead of a tall vertical stack. Each button text will be shorter on mobile (icon + short label).

### Files Changed
- `src/pages/WalletInventory.tsx` — fix stale balance bug, add account refresh, add realtime for accounts
- `src/pages/CashFlowManagement.tsx` — mobile 2×2 grid for action buttons

