# Transfer Fee System

## Goal
When transferring funds between agency accounts (MFS ↔ Bank ↔ Cash), charge a configurable fee on the source account. The fee is automatically logged as today's expense under a new `Transfer_Fee` category.

## Database Migration
- Add `Transfer_Fee` to `expense_category` enum.
- `agency_accounts`: add `default_out_fee_percent numeric DEFAULT 0`, `default_out_fee_flat_bdt numeric DEFAULT 0`.
- `fund_transfers`: add `fee_bdt numeric NOT NULL DEFAULT 0`, `fee_percent numeric`, `fee_expense_id uuid REFERENCES agency_expenses(id)`.

## Transfer Logic (`CashFlowManagement.tsx → handleTransfer`)
```text
Amount: ৳10,000   Fee (1.85%): ৳185
Source debited: ৳10,000 (transfer) + ৳185 (auto via expense trigger) = ৳10,185
Destination credited: ৳10,000
Expense row created: Transfer_Fee ৳185, paid_from = source, today
```
Steps:
1. Validate source balance >= `amount + fee`.
2. Debit source by `amount`, credit destination by `amount` (existing atomic helpers).
3. Insert `fund_transfers` row with `fee_bdt`, `fee_percent`.
4. If `fee > 0`: insert `agency_expenses` row (category `Transfer_Fee`, paid_from = source). Existing balance-sync trigger debits source for the fee — no double-debit.
5. Save returned expense id back into `fund_transfers.fee_expense_id` for audit trace.
6. Compensating rollback on any failure (mirrors current pattern).

## UI Changes
**Add/Edit Account form**: two new fields — "Default cash-out fee %" and "Flat fee (৳)". Smart hint: bKash personal ≈ 1.85%.

**Transfer Dialog**: 
- Auto-fill fee from source account's defaults when source is picked.
- Editable fee input + % toggle.
- Live summary card: `Total deducted: ৳X | Destination receives: ৳Y | Fee: ৳Z`.
- Insufficient-balance check uses `amount + fee`.

**Transfer History tab**: new "Fee" column with tooltip linking to expense.

**Expense Manager**: register `Transfer_Fee` category in filters, badge color, and totals — appears automatically in today's expenses.

## Files Touched
- DB migration (enum + 5 columns)
- `src/pages/CashFlowManagement.tsx` (account form, transfer dialog, handleTransfer, history table)
- `src/pages/ExpenseManager.tsx` (new category label/color/filter)

## Non-Goals
- No edit/delete of past transfers (append-only, matches existing policy).
- No client-side fees — agency-account transfers only.
