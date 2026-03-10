

# Plan: Mobile-Responsive Finance Pages

## Problem
All four finance sub-pages (P&L Overview, Wallet & USD, Expenses, Cash Flow) use desktop-oriented tables and cramped grids that overflow or become unreadable on mobile.

## Changes

### 1. `src/pages/FinanceHub.tsx` — Scrollable tabs
- Make `TabsList` horizontally scrollable: `overflow-x-auto scrollbar-hide flex w-full` with `flex-shrink-0` triggers
- Reduce title to `text-xl sm:text-2xl`

### 2. `src/pages/FinanceDashboard.tsx` — P&L Overview
- **KPI cards**: Already `grid-cols-2 lg:grid-cols-4` — reduce inner text to `text-xl sm:text-2xl`, hide icon on xs screens
- **P&L Summary**: Change `grid-cols-3` to `grid-cols-1 sm:grid-cols-3` with dividers between stacked items on mobile
- **Client Profitability table**: Add mobile card view (`md:hidden`) — each card shows client name, spend, revenue, profit, margin badge. Keep table for `hidden md:block`

### 3. `src/pages/WalletInventory.tsx` — Wallet & USD
- **Action button**: `w-full sm:w-auto` for "Buy USD"
- **KPI cards**: Reduce font to `text-xl sm:text-2xl` on mobile, hide period label text that overflows
- **Purchase History table**: Add mobile card view (`md:hidden`) — each card shows date, BDT paid, USD received, rate badge. Keep table `hidden md:block`

### 4. `src/pages/ExpenseManager.tsx` — Expenses
- **Summary cards**: Change `grid-cols-3` to `grid-cols-1 sm:grid-cols-3` — stack vertically on mobile
- **Pie chart + table grid**: Already `md:grid-cols-2` — good. Reduce pie chart height on mobile to 200px
- **Expenses table**: Add mobile card view (`md:hidden`) — date, category badge, amount, delete button per card. Keep table `hidden md:block`
- **Add Expense button**: `w-full sm:w-auto`

### 5. `src/pages/CashFlowManagement.tsx` — Cash Flow
- **Action buttons row**: Stack vertically on mobile: `flex-col sm:flex-row w-full sm:w-auto` for Transfer and Add Account buttons
- **Total Liquid Funds card**: Reduce text to `text-2xl sm:text-3xl`
- **Accounts table (tab)**: Add mobile card view — each card shows name, type badge, balance, active toggle, delete. Keep table `hidden md:block`
- **Transfer History table**: Add mobile card view — from→to, amount, date, note. Keep table `hidden md:block`
- **Activity feed**: Already card-based — no changes needed
- **Tabs**: Make scrollable with `overflow-x-auto scrollbar-hide`

### 6. `src/pages/PaymentRequests.tsx` — Payments & Deposits
- **Header**: Reduce title to `text-xl sm:text-2xl`
- **Tabs**: Make scrollable `overflow-x-auto scrollbar-hide`
- **Payment Requests table**: Add mobile card view (`md:hidden`) — each card shows date, client, method badge, amount, status badge, and approve/reject buttons stacked. Keep table `hidden md:block`
- **Fund Deposits table**: Same mobile card treatment — client, amount, approve/reject buttons

### Files Modified
- `src/pages/FinanceHub.tsx`
- `src/pages/FinanceDashboard.tsx`
- `src/pages/WalletInventory.tsx`
- `src/pages/ExpenseManager.tsx`
- `src/pages/CashFlowManagement.tsx`
- `src/pages/PaymentRequests.tsx`

