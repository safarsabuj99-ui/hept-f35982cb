# Clickable client names + Deposit funds on Payments page

## 1. Client names become links everywhere

Add a small shared `ClientNameLink` component that renders a client name as a link to `/admin/clients/:userId` (admins/managers only — for client-role users it renders plain text, and managers link to their own client route if one exists). Consistent styling: hover underline, keeps existing truncation.

Apply it wherever a client name is shown today:

- Payment Requests page (requests table, deposits/transactions table, mobile cards)
- Admin dashboard client overview table and profitability table
- Client list (name cells already navigate — normalize to the same component)
- Active Profitability tables (already linked — reuse the component)
- Order Management, Automation/Guard tab, low-balance / attention panels

Clicks on names inside rows that already have their own row action will stop propagation so they don't trigger both.

## 2. Deposit Funds on the Payments page

Add a primary "Deposit Funds" button in the Payment Requests page header that opens the existing `DepositFundsDialog` with the client selector enabled and admin mode on. On success, the page refreshes its lists so the new deposit appears immediately.

## 3. Searchable client picker in the deposit dialog

Replace the plain dropdown in `DepositFundsDialog` with a searchable combobox (command list inside a popover):

- Type to filter by name, business name, email or phone
- Shows business name as secondary text
- Keyboard friendly, works on mobile
- Same behaviour everywhere the dialog is used (wallet, client list, client detail)

## Technical notes

- New file `src/components/ClientNameLink.tsx`; role check via `useAuth`.
- Deposit dialog picker uses shadcn `Command` + `Popover`, fetching clients with the existing query already in the dialog (extended to include `business_name`, `email`).
- No database or business-logic changes; deposit insert logic stays as-is.
