

# Add "Hide Profit" Permission Flag

## What to do
Add a new permission key `can_view_profit` that controls whether a manager can see profit/margin data across the app. When disabled, profit columns, P&L widgets, and profitability tables are hidden — the manager can still see spend/revenue but not margins.

## Changes

### 1. `src/hooks/usePermissions.tsx`
- Add `"can_view_profit"` to `PermissionKey` type, `ALL_PERMISSION_KEYS` array
- Add it to the **Financials** group with label "View Profit & Margins"
- Add it to `finance_manager` and `full_manager` presets (not campaign_manager or view_only)

### 2. `src/pages/FinanceDashboard.tsx`
- Import `usePermissions`
- Conditionally hide: Net Profit KPI card, margin column in client profitability table, P&L summary row

### 3. `src/components/dashboard/ProfitabilityTable.tsx`
- Gate the Profit (BDT) and Margin columns behind `can_view_profit`

### 4. `src/components/ProfitLossWidget.tsx`
- Hide the entire widget if `can_view_profit` is false

### 5. `src/pages/ClientList.tsx`
- Hide the margin badge/column in client list if permission is off

### 6. `src/components/ClientProfitTab.tsx`
- Gate the entire profit tab content

No database changes needed — permissions are stored in JSONB.

