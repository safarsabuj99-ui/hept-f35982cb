

# Remove Pending Approvals Page & Add Funds Nav Item

## What Changes

The "Pending Approvals" page approves `transactions` with `status = 'pending_approval'` (fund deposits by managers). The "Payments" page already handles `payment_requests` approvals with a richer UI. These are related approval workflows that belong together. The "Add Funds" page is still needed by managers and as a quick action, but doesn't need its own admin nav slot.

## Plan

### 1. Merge Pending Approvals into Payments page
**`src/pages/PaymentRequests.tsx`**
- Add a second tab: "Fund Deposits" alongside the existing payment requests list
- This tab shows `transactions` where `type = 'credit'` and `status = 'pending_approval'` with Approve/Reject actions (current PendingApprovals logic)
- Reuse the existing table pattern already in the file

### 2. Update `usePendingCounts` hook
**`src/hooks/usePendingCounts.tsx`**
- Add a third count: `pendingDeposits` querying `transactions` where `status = 'pending_approval'`
- Combine `pendingPayments + pendingDeposits` into the Payments badge so the nav badge reflects both types

### 3. Remove nav items
**`src/components/AdminLayout.tsx`**
- Remove `{ to: "/admin/pending", ... }` (Approvals)
- Remove `{ to: "/admin/add-funds", ... }` (Add Funds)

### 4. Update routes
**`src/App.tsx`**
- Remove `PendingApprovals` import
- Remove `/admin/pending` route
- Keep `/admin/add-funds` route (still used by QuickActions and ClientOverviewTable links)

### 5. Redirect QuickActions
**`src/components/dashboard/QuickActions.tsx`**
- Change "Approve Pending" button to navigate to `/admin/payment-requests` instead of `/admin/pending`

### 6. Cleanup
- Delete `src/pages/PendingApprovals.tsx`

| File | Change |
|------|--------|
| `src/pages/PaymentRequests.tsx` | Add "Fund Deposits" tab with pending transaction approvals |
| `src/hooks/usePendingCounts.tsx` | Add deposit count, combine into payments badge |
| `src/components/AdminLayout.tsx` | Remove Approvals & Add Funds nav items |
| `src/App.tsx` | Remove PendingApprovals route (keep add-funds route) |
| `src/components/dashboard/QuickActions.tsx` | Redirect pending button to `/admin/payment-requests` |
| `src/pages/PendingApprovals.tsx` | Delete |

