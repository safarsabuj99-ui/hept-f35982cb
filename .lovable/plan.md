

# Auto-Import Ad Accounts from API Integrations

## Overview
Add an "Auto-Import" feature that automatically discovers and imports all ad accounts from connected API integrations (Meta, TikTok, Google). Each imported account gets an active/inactive toggle (already exists in the table) so you can control which accounts are tracked.

## How It Works

1. A new "Auto-Import Accounts" button on the Ad Accounts page triggers a backend function
2. The function reads all active API integrations and simulates discovering ad accounts for each one (since real API calls aren't connected, it generates realistic account IDs per platform)
3. Discovered accounts are bulk-inserted into the database, skipping any that already exist (by matching `ad_account_id` + `platform_name`)
4. A client assignment step lets you pick which client each imported account belongs to, or auto-assign based on the integration
5. The existing toggle switch in the table lets you turn individual accounts on/off

## UI Changes

### Ad Accounts Page (`src/pages/AdAccounts.tsx`)
- Add an **"Auto-Import"** button (with a `Download` icon) next to the existing "Add Account" button
- Clicking it opens a dialog showing all active API integrations grouped by platform
- Each integration has a checkbox to include/exclude it from the import
- A "Default Client" dropdown to assign imported accounts to a specific client
- An "Import" button that calls the backend function
- After import, a toast shows how many accounts were created vs skipped (duplicates)

### Import Results
- Newly imported accounts appear in the table immediately with `is_active = true`
- Duplicate accounts (same `ad_account_id`) are skipped with a count shown
- You can then toggle any account off using the existing switch

## Backend Changes

### New Edge Function: `auto-import-accounts`
- Reads all active `api_integrations`
- For each integration, simulates discovering 3-8 ad accounts per platform with realistic IDs:
  - Meta: `act_` prefix (e.g., `act_192837465`)
  - TikTok: numeric IDs (e.g., `7281930456`)
  - Google: `xxx-xxx-xxxx` format (e.g., `123-456-7890`)
- Checks existing `ad_accounts` to avoid duplicates
- Inserts new accounts with defaults: `billing_type = 'prepaid'`, `daily_spending_limit = 250`, `is_active = true`
- Links each account to the specified client and the source `api_integration_id`
- Returns `{ created: N, skipped: N, accounts: [...] }`

## Technical Details

### Files to Create
- `supabase/functions/auto-import-accounts/index.ts` -- backend discovery and import logic

### Files to Modify
- `src/pages/AdAccounts.tsx` -- add Auto-Import button and dialog with integration selection and client picker

### Edge Function Logic (pseudo)
```text
1. Verify admin auth
2. Fetch all active api_integrations
3. For each integration:
   a. Generate simulated ad account IDs based on platform
   b. Check which already exist in ad_accounts table
   c. Insert new ones with client_id and api_integration_id
4. Return summary { created, skipped }
```

### Key Details
- Deduplication uses `ad_account_id` column to prevent re-importing the same account
- The `api_integration_id` FK on `ad_accounts` links each account back to its source integration
- All imported accounts start as `is_active = true`; the admin uses the existing toggle to disable unwanted ones
- The import dialog shows a preview count of "X integrations selected, ~Y accounts expected"

