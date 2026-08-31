# Withdrawals / Borrower Loan System Upgrade

Three fixes on the Cash Flow > Withdrawals area, all in `src/pages/CashFlowManagement.tsx`.

## 1. Add a new borrow directly from the borrower popup

The transaction-history popup currently only offers "Record Return". Add an **Add Borrow** button next to it.

- Clicking it closes the history popup and opens the Withdraw dialog pre-loaded in Top-Up mode for that borrower: borrower name, category, and root loan link pre-filled, amount empty.
- The Withdraw dialog title stays "Add Top-Up Borrow" in that mode, so the new amount joins the same borrower ledger instead of creating a duplicate borrower.

## 2. Borrower list must not be hidden by the account selection

Today the borrower dropdown only lists borrowers whose original loan came from the selected account, and choosing a different account silently wipes the borrower name and the top-up link.

- Show **all** active borrowers in the picker regardless of the selected account, sorted by most recent activity, each row showing its original account and current outstanding.
- Borrowers linked to the currently selected account are grouped first ("This account"), the rest under "Other accounts" — nothing is filtered out.
- Changing the From Account no longer clears the borrower name or the top-up link. The only thing that breaks the link is the user typing a different name or clicking "Make new instead".

## 3. One borrower can borrow from multiple accounts

- A top-up borrow is saved against the account chosen in the dialog, even when that differs from the account of the original borrow. The borrower ledger stays a single group.
- The top-up summary card warns clearly when the chosen account differs from the original one ("Borrowing from a different account — will be added to the same ledger").
- Balance check keeps using the selected account's fresh balance before allowing the withdrawal.
- The history popup replaces the single "Account: X" line with a per-row account: each borrow event shows which account the money came from, each return shows which account it went back to. The header shows the set of accounts involved.
- Record Return: the "to account" defaults to the account of the oldest open borrow, and the dialog notes which accounts the outstanding amount came from so money can be returned to the right place.

## Technical notes

- Grouping stays keyed on `parent_withdrawal_id` roots, so no schema change is needed — `cash_withdrawals.from_account_id` already varies per row.
- `handleWithdraw` keeps resolving the root id and calls `adjustAccountBalance` on the selected account only.
- FIFO return allocation across a mixed-account group is unchanged; only the default target account and the labels change.
