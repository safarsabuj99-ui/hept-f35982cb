

# Replace "Acct Limit" Column with Outstanding Balance Progress Bar

## What Changes
Replace the static "Acct Limit" column (currently showing `$250`) with a dynamic **"Balance"** column that shows the outstanding balance (`current_threshold_spend`) as a progress bar filling toward the threshold limit.

## Technical Plan

### `src/pages/AdAccounts.tsx`

1. **Rename column header** from "Acct Limit" to "Balance" (line 328)

2. **Replace the cell content** (line 374) — currently `${a.account_spending_limit ?? 250}` — with:
   - For **threshold** accounts: Show `current_threshold_spend` as a dollar amount + a progress bar showing percentage toward `threshold_limit`, e.g.:
     ```
     $37.03 / $250
     [████░░░░░░░░] 15%
     ```
   - For **prepaid** accounts: Show a dash or `$0` since they don't have outstanding balances
   - Color-code the progress bar: green (<60%), yellow (60-79%), red (≥80%)

3. The data is already available — `current_threshold_spend` and `threshold_limit` are columns on `ad_accounts` and already fetched. The `usagePct` calculation on line 338-340 can be reused here.

4. **Remove the separate "Threshold" column** (line 330 header, lines 380-396 cell) since the progress bar is now merged into the Balance column — avoiding duplication.

### No database or edge function changes needed.

