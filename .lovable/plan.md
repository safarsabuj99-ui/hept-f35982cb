# Fix: withdrawal saved under the wrong borrower

## What happened

Today's ৳1,000 taken from the MD SABUJ MIAH account was stored as a top-up on the "MD SABUJ MIAH" borrower ledger (the Aug 30 ৳4,514 borrow), not on Asad Vai. Asad Vai's ledger has had no new entry since Aug 25. So the money left the account correctly, but it joined the wrong borrower.

The Withdraw dialog makes this easy to do: the borrower field keeps whatever borrower/top-up link was set from an earlier use, the dialog never resets when it opens, and nothing on screen states in plain words which ledger the money will land on before you press the button. If the borrower row in the picker isn't actually clicked (or the click doesn't register), the old borrower silently stays selected.

Per your answer, the existing ৳1,000 entry stays as it is.

## Changes

### 1. Clean slate every time the dialog opens
Opening Withdraw from the toolbar always resets account, borrower, top-up link, category, amount, date and note. Only "Add Borrow" from a borrower's history popup pre-fills that borrower.

### 2. Say out loud where the money goes
A confirmation strip sits directly above the submit button:
- Top-up: "Adding ৳X to **Asad Vai** — outstanding becomes ৳Y" plus the source account name.
- New borrower: "Creating new borrower **<name>**".
The submit button repeats the target: "Add ৳1,000 to Asad Vai".

### 3. No accidental submits
Submit is disabled until a borrower is either explicitly picked from the list or explicitly created via a "Create new borrower: <name>" row. Typing a name that partially matches an existing borrower shows an inline warning offering to link to that borrower instead of creating a near-duplicate.

### 4. Clearer picker
- Each row shows borrower name, source account and outstanding, with a visible selected state.
- Picking a row closes the popup and immediately reflects the name in the trigger button.
- A dedicated "Create new borrower" row replaces the ambiguous empty-state text, so pressing Enter can never fall through to a highlighted unrelated row.

### 5. Delete a wrong entry
Each row in the Transaction History popup gets a delete action (confirm first). Deleting a borrow refunds its amount back to the account it came from; deleting a return re-deducts. Deleting the root of a group with top-ups is blocked with a message to delete the top-ups first.

## Technical notes

- All work is in `src/pages/CashFlowManagement.tsx`.
- Reset logic hangs off the Dialog `onOpenChange` so it also clears after cancel.
- Borrower selection tracked with an explicit `wdBorrowerMode` state (`picked` | `new` | `none`) instead of inferring intent from `wdParentId` and free text.
- Deletion uses `adjustAccountBalance` on the row's own `from_account_id` / return account, then removes the row; returns are removed from `cash_withdrawal_returns` and the parent's `returned_bdt` / `status` recomputed.
- No schema change.
