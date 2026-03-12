

# Bulk Delete Ad Accounts

## What We'll Build
Add multi-select checkboxes to the Ad Accounts table (desktop and mobile) with a floating bulk action bar for deleting multiple ad accounts at once, using the same cascade deletion logic from AdAccountDetail.

## Changes — `src/pages/AdAccounts.tsx`

### State
- `selectedAccounts: Set<string>` — tracks selected account IDs
- `bulkDeleting: boolean` — loading state during deletion

### Deletion Logic
- `handleBulkDelete()` — loops through selected IDs, for each runs the same cascade: delete from `ad_account_clients`, `billing_notifications`, `campaign_performance`, `daily_ad_spend`, `campaign_mappings`, `campaigns`, then `ad_accounts`. Shows progress toast, refreshes data on completion, clears selection.

### UI
- **Desktop table**: Add a checkbox column (header = select all on current page, rows = individual select)
- **Mobile cards**: Add a checkbox in each card's top row
- **Floating bulk action bar**: When `selectedAccounts.size > 0`, render a fixed-bottom bar showing count + "Delete Selected" button (destructive style)
- **Confirmation dialog**: AlertDialog before executing deletion — "Are you sure you want to permanently delete X ad account(s) and all related data?"
- Clear selection on search/filter/page change

### Imports
- Add `Trash2` from lucide-react
- Add `AlertDialog` components (already used in AdAccountDetail)

No database changes needed.

