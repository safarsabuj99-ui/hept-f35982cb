

## Add Delete Option for Ad Accounts

### What
Add a "Delete Ad Account" button on the Ad Account Detail page that removes the ad account and all its related data (assignments, campaigns, metrics, notifications). This allows re-importing the same account later via "Sync from API".

### Implementation

**File: `src/pages/AdAccountDetail.tsx`**

1. Add a delete confirmation dialog (using AlertDialog) with a red "Delete Account" button in the Settings tab
2. The delete handler will:
   - Delete from `ad_account_clients` where `ad_account_id` matches
   - Delete from `billing_notifications` where `ad_account_id` matches
   - Delete from `campaign_performance` where `ad_account_id` matches
   - Delete from `daily_ad_spend` where `ad_account_id` matches
   - Delete from `campaigns` where `ad_account_id` matches (which cascades to `daily_metrics`)
   - Delete from `ad_accounts` where `id` matches
   - Navigate back to `/admin/ad-accounts` on success
   - Show a success toast

3. Import `AlertDialog` components and `Trash2` icon
4. Add state for `deleteConfirmOpen` and `deleting`

### UI Placement
- Red outlined "Delete Account" button at the bottom of the Settings tab, inside a danger zone card
- AlertDialog confirms: "This will permanently delete this ad account and all associated data. You can re-import it later using Sync from API."

### No Database Changes Required
All deletes use existing RLS policies (admin has ALL access on all relevant tables). The `ad_account_id` in the auto-import function uses `ON CONFLICT (ad_account_id, platform_name) DO UPDATE`, so re-importing will create a fresh record.

