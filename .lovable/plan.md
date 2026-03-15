

## Plan: Unify Client-Side Deposit Dialog with Admin Client Detail Page

### Problem
The client-side deposit dialog (ClientWallet, ClientDashboard) is missing the **Payment Date** picker that the admin's client detail page deposit dialog has. The user wants both sides to show the same form.

### What's Different
The `DepositFundsDialog` component already supports the Payment Date field — it's controlled by the `isAdmin` prop. When `isAdmin={true}` (client detail page), the date picker shows. When not passed (client-side), it's hidden.

### Fix

**File: `src/components/DepositFundsDialog.tsx`**
- Remove the `isAdmin` condition around the Payment Date field — always show it
- Always include `payment_date` in the insert payload (not just when `isAdmin` is true)
- Keep the `isAdmin` prop for any other admin-specific behavior if needed

This is a ~5 line change in one file. All consumer pages (ClientWallet, ClientDashboard, ClientDetail, AdminDashboard, ClientList) automatically get the unified form.

### Files to Change
| File | Change |
|------|--------|
| `src/components/DepositFundsDialog.tsx` | Remove `isAdmin` guard on Payment Date field; always include `payment_date` in payload |

