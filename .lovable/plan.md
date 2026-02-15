

# Remove Currency Toggle from Dashboard

## What Changes
Remove the "Show BDT (120 BDT/USD)" toggle button from the admin dashboard header and the manager dashboard. The underlying exchange rate logic stays intact since it's used for actual financial calculations (Add Funds, Client Detail pricing, etc.) -- only the UI toggle is removed.

## Technical Details

### 1. Remove CurrencyToggle from `DashboardHeader.tsx`
- Remove the `CurrencyToggle` import and its usage from the header's action row
- The header will keep the stat pills (Active Accounts, Pending) but drop the currency toggle button

### 2. Remove CurrencyToggle from `ManagerDashboard.tsx`
- Remove the `CurrencyToggle` import and component from the manager dashboard header
- Replace `formatAmount()` calls (which respect the toggle state) with simple USD formatting (`$${value.toFixed(2)}`) since there's no toggle anymore

### 3. Replace `formatAmount` in `PendingApprovals.tsx`
- Remove `useCurrency` import and `formatAmount` usage
- Use straightforward USD formatting instead

### 4. Delete `CurrencyToggle.tsx`
- Remove `src/components/CurrencyToggle.tsx` since it's no longer used anywhere

### 5. Keep `CurrencyProvider` and `useCurrency` hook
- The exchange rate value is still needed for BDT calculations in AdminDashboard KPI cards, AddFunds page, and Client Detail pricing
- No changes to `src/hooks/useCurrency.tsx` or `src/App.tsx`

