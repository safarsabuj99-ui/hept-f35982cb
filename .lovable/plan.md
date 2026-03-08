

# Add Historical Payment Date for Admin Deposits

## What
Add a date picker to the DepositFundsDialog that only appears for admins, allowing them to set a historical "payment collected" date. Clients will not see this field.

## How to Determine Admin Context
The dialog already has a reliable admin indicator: admin views pass `showClientSelector={true}` or use it from admin pages (ClientList, ClientDetail, AdminDashboard). We can add a new prop `showDatePicker?: boolean` that admin callers set to `true`, or more simply, reuse the existing admin-only prop pattern by adding an `isAdmin` prop.

## Changes

### 1. `src/components/DepositFundsDialog.tsx`
- Add `isAdmin?: boolean` prop to the interface
- Add a `paymentDate` state (defaults to today)
- When `isAdmin` is true, render a date picker field (using Popover + Calendar) labeled "Payment Date" allowing the admin to pick a historical date
- Include the selected date in the `payment_requests` insert as `created_at` — but since `created_at` has a default of `now()`, we should instead store it in a way the approve-payment function can use it. The cleanest approach: store the date in the `transaction_id` field as a note, or better, we pass it along and the approve function uses it for the transaction `date`.

**Better approach**: Add the date to the insert payload. The `payment_requests` table doesn't have a dedicated payment date column, so we'll use the `created_at` field override. Actually, `created_at` is auto-generated. Instead, we'll pass the chosen date in `admin_note` or add a column.

**Simplest approach**: Add a `payment_date` column to `payment_requests`, then have the `approve-payment` edge function use that date (instead of `new Date()`) for the transaction's `date` field.

### 2. Database Migration
- Add `payment_date` column to `payment_requests` table: `date`, nullable, default `null`

### 3. `supabase/functions/approve-payment/index.ts`
- When creating the transaction, use `pr.payment_date || new Date().toISOString().split("T")[0]` for the `date` field instead of always using today

### 4. Admin caller pages
- Pass `isAdmin={true}` to `DepositFundsDialog` from:
  - `src/pages/AdminDashboard.tsx`
  - `src/pages/ClientList.tsx`
  - `src/pages/ClientDetail.tsx`
- Client page (`src/pages/ClientDashboard.tsx`) does NOT pass `isAdmin`, so no date picker appears

## Summary of Files
| File | Change |
|------|--------|
| DB migration | Add `payment_date date` column to `payment_requests` |
| `DepositFundsDialog.tsx` | Add `isAdmin` prop, date picker UI, include `payment_date` in insert |
| `approve-payment/index.ts` | Use `pr.payment_date` for transaction date when available |
| `AdminDashboard.tsx` | Pass `isAdmin` |
| `ClientList.tsx` | Pass `isAdmin` |
| `ClientDetail.tsx` | Pass `isAdmin` |

