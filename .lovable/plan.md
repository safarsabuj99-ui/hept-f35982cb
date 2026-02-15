

# Add Reusable "Deposit Funds" Dialog Everywhere

## Overview
Extract the existing "Deposit Funds" modal from the Client Dashboard into a standalone reusable component, then add it to all relevant pages so admins, managers, and clients can trigger it from anywhere.

## What Changes

### 1. New Component: `src/components/DepositFundsDialog.tsx`
Extract the deposit modal logic from `ClientDashboard.tsx` into a self-contained dialog component with these props:
- `open` / `onOpenChange` -- control visibility from any parent
- `clientId` -- which client to submit the payment request for
- `onSuccess` -- callback after successful submission (so the parent can refresh data)

The dialog includes:
- **Amount (BDT)** input with `৳` placeholder
- **Payment Method** dropdown (Bank Transfer, bKash, Nagad, Cash)
- **Transaction ID / Note** optional input
- Cancel and Submit buttons with loading state
- Inserts into the `payment_requests` table (same logic as current ClientDashboard)

### 2. Refactor `src/pages/ClientDashboard.tsx`
- Remove the inline deposit modal code (state variables, form handler, Dialog JSX)
- Import and use the new `DepositFundsDialog` component instead
- Pass `user.id` as `clientId` and `fetchAll` as `onSuccess`

### 3. Add to `src/pages/ClientDetail.tsx`
- Replace the current "Add Funds" button (which navigates to `/admin/add-funds`) with one that opens the `DepositFundsDialog` inline
- Pass the current `userId` param as `clientId`
- On success, reload the client data

### 4. Add to `src/pages/ClientList.tsx`
- Add a small "Add Funds" action button per client row
- Clicking it opens the `DepositFundsDialog` pre-filled for that client
- On success, show a toast confirmation

### 5. Add to `src/pages/AdminDashboard.tsx`
- Add a Quick Action or header button to open the deposit dialog
- Since no client is pre-selected, the dialog will include a client selector dropdown (an optional `showClientSelector` prop)

## Technical Details

- The component handles its own state internally (amount, method, trxId, submitting)
- Resets form fields on close
- Uses the existing `payment_requests` table insert
- The `showClientSelector` prop (default false) adds a client dropdown when the dialog is opened without a pre-selected client (e.g., from AdminDashboard)
- For client-facing pages, the client selector is hidden since the client is implicit

