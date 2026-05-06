## Goal
On the Withdrawals tab, when a borrower has already taken money from an account and the loan is still active (outstanding > 0), allow the admin to **add a new top-up borrow** to that existing record instead of being forced to create a brand-new withdrawal entry. This keeps each borrower's history consolidated and shows a true running total.

## Current Behavior
Every "Record Withdrawal" creates a brand-new `cash_withdrawals` row, even if the same borrower (e.g. *Arif*, *Sabuj Miah*) is already listed as Active. So one borrower who takes ৳1,000 today and ৳500 next week shows up as **two separate Active rows** — hard to track total exposure per person.

## Proposed UX

### A. Smart "Borrower" field in the Withdraw dialog
- Replace plain text input with a **combobox** that suggests existing **Active** borrowers (status = `active` / `partially_returned`) for the selected source account.
- When user picks an existing borrower → dialog switches to **"Top-Up Mode"**:
  - Header changes to: *"Add new borrow for Arif (Outstanding: ৳12,500)"*
  - Shows a mini summary: previous principal, returned, current outstanding.
  - Submit button reads **"Add Top-Up"**.
- If the typed name doesn't match → normal **"New Borrower"** flow (current behavior).

### B. Withdrawals table — collapsible borrower groups
- Group rows by borrower (per source account). Default view shows one row per borrower with **Total Borrowed / Total Returned / Outstanding**.
- Click chevron → expands to show every individual top-up entry with its own date and Return button.
- Each top-up row remains independently returnable (preserves existing return logic).

### C. Borrower detail dialog (optional polish)
Clicking a borrower opens a timeline: every borrow + every return chronologically with running balance.

## Technical Plan

### Database
Add a lightweight grouping column without breaking existing data:
- `cash_withdrawals.parent_withdrawal_id uuid REFERENCES cash_withdrawals(id)` — null for the **first** borrow, set to the original row for top-ups.
- Index on `(from_account_id, borrower_name, status)` for fast active-borrower lookup.
- No enum changes, no trigger changes — each top-up is still a real withdrawal row, so balance debits and the existing return flow keep working untouched.

```text
Row 1: Arif | ৳12,500 | parent=null     ← original
Row 2: Arif | ৳5,000  | parent=Row1.id  ← top-up #1
Row 3: Arif | ৳2,000  | parent=Row1.id  ← top-up #2
```

### Frontend (`src/pages/CashFlowManagement.tsx`)
1. **Active-borrower lookup**: derive list from existing `withdrawals` state (filter `status != fully_returned` and matching `from_account_id`).
2. **Borrower combobox**: shadcn `Command` inside `Popover`, with "Create new borrower 'X'" footer item.
3. **handleWithdraw**: if an existing borrower is selected, set `parent_withdrawal_id` to that root id (resolve root by walking parent chain — usually 1 hop). Otherwise insert as today.
4. **Grouping helper**: build `groupedWithdrawals = Map<rootId, { root, children[], totals }>` for the table render.
5. **Table refactor**: render grouped rows with expand/collapse via `useState<Set<string>>` for open rootIds. Reuse existing return dialog per child row.
6. Keep existing pagination — paginate over groups, not raw rows.

### Logic Snippet (illustrative)
```typescript
// Detect existing active borrower on submit
const root = withdrawals.find(w =>
  w.from_account_id === wdFromAccId &&
  w.borrower_name.toLowerCase() === wdBorrower.trim().toLowerCase() &&
  w.status !== "fully_returned" &&
  !w.parent_withdrawal_id
);

await supabase.from("cash_withdrawals").insert({
  from_account_id: wdFromAccId,
  amount_bdt: amt,
  borrower_name: root?.borrower_name ?? wdBorrower.trim(),
  category: root?.category ?? wdCategory,
  parent_withdrawal_id: root?.id ?? null,
  date: wdDate,
  ...
});
```

## Files Touched
- DB migration (1 column + 1 index)
- `src/pages/CashFlowManagement.tsx` (combobox, grouping, table render, handleWithdraw)

## Non-Goals
- No change to return flow, balance triggers, or expense logic.
- No retroactive merging of historical duplicate borrowers (admins can leave old rows; new top-ups going forward will group correctly). Optional one-time SQL cleanup can be offered later.
