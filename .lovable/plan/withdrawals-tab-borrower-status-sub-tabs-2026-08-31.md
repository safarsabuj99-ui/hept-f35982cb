# Withdrawals tab: borrower status sub-tabs

Split the Withdrawals tab into three sub-tabs so borrowers are grouped by repayment state.

## Sub-tabs

1. **Active** — borrowers with nothing returned yet (returned = 0, outstanding > 0)
2. **Partially Returned** — some returned, still outstanding
3. **Fully Returned** — every borrow in the group closed, outstanding = 0

Each sub-tab label shows a live count, e.g. `Active (11)`.

## Behaviour

- Grouping stays exactly as today (root borrow + its top-up borrows rolled into one borrower row).
- Both the desktop table and the mobile card list render inside every sub-tab, unchanged in columns and styling.
- Pagination is per sub-tab: switching sub-tabs resets to page 1 so you never land on an empty page.
- Return button keeps its current rule (hidden once fully returned), so it appears on Active and Partially Returned only.
- Clicking a borrower name still opens the Transaction History popup with Add Borrow / delete actions.
- Empty state per sub-tab, e.g. "No fully returned borrowers yet".
- The parent Withdrawals tab count keeps its current meaning (open borrows).

## Technical notes

All work is in `src/pages/CashFlowManagement.tsx`, inside `TabsContent value="withdrawals"`:

- Lift the group-building IIFE (lines ~1464-1489) into a `useMemo` so the three sub-tabs share one derived list.
- Derive a `state` field per group: `fully` when `allReturned`, `partial` when `totalReturned > 0`, else `active`.
- Add nested `<Tabs>` with state stored in a new `wdSubTab` state; reset `wdPage` on change.
- Extract the existing mobile-card and desktop-table markup into a small local render function taking the filtered group array, so all three sub-tabs reuse it without duplication.

No database or business-logic changes.
