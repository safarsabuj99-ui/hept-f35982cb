## Goal
Simplify the Withdrawals tab so each borrower appears as a **single row** showing total borrow / total returned / outstanding, with **one Return button** that deducts directly from the running total. Clicking the borrower's name opens a **full transaction history** dialog (every borrow + every return chronologically).

## Current Pain
After the Top-Up feature, each top-up still renders as a child row when the group is expanded, and every child has its own Return button. For borrowers like *Sagro* who borrow many times, this looks cluttered — admin only cares about: "How much does Sagro owe me total? Let me record his payment." History should be on-demand, not always visible.

## Proposed UX

### Withdrawals tab — single row per borrower
- One flat row per borrower (per source account):
  - **Borrower name** (clickable → opens history dialog)
  - Account
  - Total Borrowed (sum of root + all top-ups)
  - Total Returned (sum across all entries)
  - **Outstanding** (the headline number)
  - Last activity date
  - Status badge (Active / Partially Returned / Fully Returned / Overdue)
  - Single **"Return"** button (disabled when outstanding = 0)
- Remove the chevron / expand UI and the per-entry child sub-table.

### Borrower history dialog (opens on name click)
- Header: *"{Borrower} — Transaction History"* with summary chips: Total Borrowed / Total Returned / **Outstanding**.
- Single chronological timeline (date asc), each row is one of:
  - **Borrow** entry: date, amount (+৳), note, expected return date.
  - **Return** entry: date, amount (−৳), note, which account it went back to.
- Right column shows **running balance** after each event.
- Read-only; no edit/delete (preserves audit trail). Admin closes dialog and uses the main "Return" button to record a new return.

### Return dialog — pay against total outstanding
- Header: *"Record return from {borrower}"*
- Shows: Total Borrowed, Already Returned, **Outstanding (max returnable)**, "Return to account" selector, date, optional note.
- Single amount field, validates `≤ outstanding`.
- On submit, the system **auto-allocates** the return across the borrower's open withdrawal rows (oldest-first FIFO) so the existing per-row `returned_bdt` / `status` columns and balance-credit trigger keep working untouched. Admin doesn't see or pick rows.

```text
Sagro owes ৳15,000 across 3 withdrawals:
  Row A: 5,000 borrowed, 0 returned   (oldest)
  Row B: 7,000 borrowed, 0 returned
  Row C: 3,000 borrowed, 0 returned

Admin records ৳8,000 return:
  → Row A fully returned (5,000)
  → Row B partially returned (3,000)
  → Row C untouched
Outstanding now = ৳7,000
```

## Technical Plan (frontend only, no schema change)

File: `src/pages/CashFlowManagement.tsx`

1. **Table render (Withdrawals tab)**: replace the grouped/expandable structure with a flat one-row-per-borrower table. Drop `expandedGroups` state and the children sub-table. Reuse existing grouping helper (`rootMap` → groups with `totalBorrowed`, `totalReturned`, `outstanding`, `allReturned`, `anyOverdue`, `latestDate`).
2. **Borrower history dialog**: new state `historyGroup`. Click on borrower name sets it. Dialog merges the group's withdrawal rows + matching `cash_withdrawal_returns` rows into a single sorted timeline with running-balance computation.
3. **Single Return button per group** opens a new "borrower return" dialog that carries the **group** (not a single row).
4. **New return handler `handleRecordBorrowerReturn`**:
   - Input: group + amount + to-account + date + note.
   - Fetch open child rows (already in state) ordered by `date asc, created_at asc`, status ≠ `fully_returned`.
   - Loop allocating `remaining` to each row:
     - `apply = min(remaining, row.amount_bdt - row.returned_bdt)`
     - Insert one `cash_withdrawal_returns` row per touched withdrawal (preserves audit trail and the balance-credit trigger).
     - Update `cash_withdrawals.returned_bdt` and `status` (`partially_returned` / `fully_returned`).
   - Stop when `remaining == 0`. Single toast at the end.
5. **Remove** the legacy per-row return path (`openReturnDialog` / `handleRecordReturn`) since it's no longer reachable from the UI.
6. **Pagination**: continue paginating over groups.
7. **No DB / trigger / type changes.**

## Files Touched
- `src/pages/CashFlowManagement.tsx` (table refactor + borrower history dialog + new return handler/dialog + cleanup)

## Non-Goals
- No schema migration.
- No change to the borrower combobox / top-up flow in the Withdraw dialog.
- No change to liquid-fund loans, transfers, or balance triggers.
