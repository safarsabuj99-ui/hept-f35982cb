

# Sync Live Billing Data from Ad Platforms

## Problem
Currently, billing data (threshold limit, current threshold spend, next billing date, account spending limit) is only fetched during the initial auto-import. After that, these values go stale unless manually edited. The user wants to pull **live** data directly from the ad platform APIs and display exactly what the ad account has set.

## Solution
Create a new edge function `sync-billing-data` that fetches live billing/spending data from platform APIs for existing ad accounts, and add a "Sync from Platform" button on the Ad Account Detail page.

## Changes

### 1. New Edge Function: `supabase/functions/sync-billing-data/index.ts`

For a given ad account ID, this function will:
- Look up the account and its linked `api_integration` (token + platform)
- Call the platform API to fetch live billing data:
  - **Meta**: `GET /{ad_account_id}?fields=spend_cap,amount_spent,balance` for account spending limit + `/{ad_account_id}/adspaymentcycle?fields=threshold_amount,amount_spent,end_time` for threshold/billing cycle
  - **TikTok**: `GET /advertiser/info/` for balance info
  - **Google**: Budget/billing data from the Google Ads API
- Update the `ad_accounts` row with fresh values: `account_spending_limit`, `threshold_limit`, `current_threshold_spend`, `next_billing_date`, `billing_type`
- Return the updated data to the frontend

### 2. Update `src/pages/AdAccountDetail.tsx`

- Add a **"Sync from Platform"** button (with a refresh icon) next to the Save button or in the header
- On click, call the `sync-billing-data` edge function with the account ID
- On success, reload the account data and show a toast with what was updated
- Show a "Last synced" timestamp if available
- Make the threshold, spending limit, and next billing date fields display both the **platform value** (read-only, fetched) and allow admin override

### 3. Update auto-import to also refresh existing accounts (optional enhancement)

Currently the auto-import skips existing accounts. We can add an `update_existing: true` option that updates billing fields for already-imported accounts during bulk import.

## Technical Details

**Meta API fields for account-level data:**
```
GET /act_{id}?fields=spend_cap,amount_spent,balance,currency,funding_source_details
```
- `spend_cap`: The account spending limit (in cents) — this is the "Account Spending Limit" the user wants
- `amount_spent`: Total lifetime spend
- `balance`: Current prepaid balance

**Meta billing cycle (already implemented in auto-import):**
```
GET /act_{id}/adspaymentcycle?fields=threshold_amount,amount_spent,end_time
```

### Files to create/modify:
- **Create**: `supabase/functions/sync-billing-data/index.ts`
- **Modify**: `src/pages/AdAccountDetail.tsx` — add sync button and refresh logic
- **Modify**: `supabase/config.toml` — add JWT config for new function (actually auto-managed, skip)

