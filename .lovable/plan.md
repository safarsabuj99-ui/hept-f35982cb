

# Complete SaaS Data Reset

Wipe every table clean so the application starts fresh with zero data. Settings rows will be kept (exchange_rate, service_margin, sync_start_date) since the app expects them to exist, but their values will be reset to defaults.

## Deletion Order

Tables must be deleted in dependency order (children first) to avoid constraint issues:

1. **Round 1 -- Leaf tables** (no dependents):
   - `campaign_performance`
   - `daily_ad_spend`
   - `campaign_mappings`
   - `billing_notifications`
   - `campaign_requests`
   - `payment_requests`
   - `audit_logs`
   - `fund_transfers`
   - `agency_expenses`
   - `usd_purchases`
   - `transactions`
   - `manager_permissions`

2. **Round 2 -- Junction / child tables**:
   - `ad_account_clients`

3. **Round 3 -- Core entity tables**:
   - `ad_accounts`
   - `api_integrations`
   - `agency_accounts`

4. **Round 4 -- User data**:
   - `user_roles`
   - `profiles`

5. **Round 5 -- Reset settings to defaults** (keep rows, update values):
   - `exchange_rate` -> `"120"`
   - `service_margin_percentage` -> `"0"`
   - `sync_start_date` -> today's date

## Important Notes

- **User accounts in the authentication system will remain** (login credentials). Only their profile data and roles are removed. If you also want auth users deleted, that requires manual removal from the backend.
- After the reset, you will need to **re-create at least one admin profile and role** to log in and use the admin panel. Otherwise the app will treat all users as having no role.
- Settings rows are preserved because the app reads them on load; deleting them would cause errors.

## Technical Details

All deletions will be executed as SQL `DELETE FROM <table>;` statements using the data change tool, grouped into batches for efficiency.

