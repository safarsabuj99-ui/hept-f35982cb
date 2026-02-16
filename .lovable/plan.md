

# Consolidate Finance Pages into One Tabbed View

## Overview
Merge the 4 separate finance-related pages (Finance Dashboard, Wallet & Inventory, Expenses, Cash Flow) into a single unified "Finance" page with tabs. This removes 4 sidebar items (Finance, Wallet, Expenses, Cash Flow) and replaces them with just one "Finance" entry.

## Page Structure

The unified Finance page at `/admin/finance` will use a top-level `Tabs` component with 4 tabs:

| Tab | Content Source | Description |
|-----|---------------|-------------|
| **P&L Overview** | Current `FinanceDashboard.tsx` | Net profit, WAC, revenue vs COGS, client profitability table |
| **Wallet & USD** | Current `WalletInventory.tsx` | USD purchase history, stock status, buy USD form |
| **Expenses** | Current `ExpenseManager.tsx` | Agency expenses log, category breakdown, add expense |
| **Cash Flow** | Current `CashFlowManagement.tsx` | Agency accounts, fund transfers, activity feed |

## Changes

### 1. New wrapper: `src/pages/FinanceHub.tsx`
- A lightweight wrapper page that renders a `Tabs` component
- Each `TabsContent` renders the existing page component directly (no rewriting the internals)
- Each existing page component becomes a "section" component -- just removing their own `h1` headers so the hub provides a unified title
- Supports URL hash or query param to deep-link to a specific tab (e.g., `/admin/finance?tab=expenses`)

### 2. Modify `src/pages/FinanceDashboard.tsx`
- Remove the outer `h1`/description header (the hub will provide it)
- Export remains unchanged

### 3. Modify `src/pages/WalletInventory.tsx`
- Remove the outer page header
- Export remains unchanged

### 4. Modify `src/pages/ExpenseManager.tsx`
- Remove the outer page header
- Export remains unchanged

### 5. Modify `src/pages/CashFlowManagement.tsx`
- Remove the outer page header
- Export remains unchanged

### 6. Modify `src/App.tsx`
- Replace the 4 separate routes (`/admin/finance`, `/admin/wallet`, `/admin/expenses`, `/admin/cash-flow`) with a single route: `/admin/finance` pointing to the new `FinanceHub`
- Remove the old individual route imports (keep the component imports since FinanceHub uses them)

### 7. Modify `src/components/AdminLayout.tsx`
- Remove the 4 separate nav items (Finance, Wallet, Expenses, Cash Flow)
- Add a single "Finance" nav item pointing to `/admin/finance`
- Use `TrendingUp` icon for the consolidated entry
- The `permKey` remains `can_manage_finance`

## Technical Details

### Tab State Management
- Use `useState` with URL search params for tab persistence
- When navigating to `/admin/finance?tab=cash-flow`, it auto-selects that tab
- Default tab: "overview" (P&L)

### No Database Changes
No schema modifications needed -- this is purely a UI consolidation.

### Route Redirects
- Old bookmarks to `/admin/wallet`, `/admin/expenses`, `/admin/cash-flow` will redirect to `/admin/finance` with the appropriate tab query param using `<Navigate>` components

