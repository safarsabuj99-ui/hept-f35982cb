

# Real API Auto-Import for Ad Accounts

## Overview
Replace the current simulated auto-import with real API calls to Meta, TikTok, and Google to fetch actual ad accounts with full metadata. The system will automatically pull account ID, account name, currency, billing type (prepaid/threshold), threshold limit, and monthly billing date directly from the platform APIs. Deduplication ensures accounts already in the SaaS are never added twice.

## What Changes

### 1. Database: Add `account_name` Column
The `ad_accounts` table currently has no name field. We need to add an `account_name` text column so the real account name fetched from the API can be stored and displayed.

### 2. Edge Function: Real API Calls Instead of Fake Data
The `auto-import-accounts` function will be completely rewritten to:

- Read the `api_token` and `app_id` from each selected `api_integrations` record
- Call the real platform APIs to discover ad accounts:
  - **Meta**: `GET https://graph.facebook.com/v21.0/{app_id}/owned_ad_accounts?fields=account_id,name,currency,funding_source_details,account_status&access_token={token}`
  - **TikTok**: `GET https://business-api.tiktok.com/open_api/v1.3/advertiser/info/?advertiser_ids=[...]` (uses app_id as advertiser list source)
  - **Google**: `GET https://googleads.googleapis.com/v18/customers/{customer_id}/googleAds:searchStream` (customer list query)
- Extract real metadata from each account:
  - Account ID (the platform's native ID)
  - Account Name
  - Currency (USD, BDT, etc.)
  - Billing type: prepaid vs threshold/postpaid (from funding source details)
  - Threshold limit (for threshold accounts)
  - Next billing date / monthly billing date
- Deduplicate by matching `platform_name + ad_account_id` against existing records
- Insert only new accounts with all metadata populated
- Return summary with created vs skipped counts

### 3. UI Changes to Ad Accounts Page

**Table Updates:**
- Add a new "Account Name" column after the Platform column
- Display the real account name fetched from the API

**Auto-Import Dialog Updates:**
- Remove the "Default Client" requirement from import -- accounts import without a client first
- After import, admin can assign clients to individual accounts from the table
- Show real-time import progress (fetching from Meta... found 5 accounts)

**Client Assignment:**
- Add a client assignment dropdown directly in the table for each account row
- Admin can assign/reassign clients per account after import

### 4. Deduplication Logic
- Before inserting, check all existing `ad_account_id + platform_name` combinations
- Only import accounts that don't already exist
- If you add a new account on your Meta Business Manager and re-run import, only the new one gets added
- Toast shows: "Created 1 new account, skipped 5 existing"

## Technical Details

### Files to Modify
- `supabase/functions/auto-import-accounts/index.ts` -- rewrite with real API calls to Meta/TikTok/Google
- `src/pages/AdAccounts.tsx` -- add account_name column, inline client picker, remove mandatory client from import dialog

### Database Migration
```sql
ALTER TABLE ad_accounts ADD COLUMN account_name text DEFAULT '';
```

### Edge Function API Flow (per platform)

```text
Meta:
1. GET /v21.0/{business_id}/owned_ad_accounts
   fields: account_id, name, currency, funding_source_details, account_status
2. Parse funding_source_details to determine billing_type:
   - type=1 (credit card, prepaid) -> "prepaid"
   - type=2 (threshold/invoicing) -> "threshold_postpaid"
3. Extract threshold amount and billing cycle from funding details
4. Map currency directly from API response

TikTok:
1. GET /open_api/v1.3/advertiser/info/
   Headers: Access-Token: {token}
2. Fields: advertiser_id, advertiser_name, currency, balance, contacter
3. Billing type derived from account balance type

Google:
1. Use REST API to list accessible customers
2. Query each customer for name, currency_code, billing_setup
3. Map billing setup to prepaid/postpaid
```

### Key Behaviors
- Accounts import WITHOUT a client assignment initially (client_id will be nullable or use a default)
- Admin assigns clients after reviewing imported accounts
- Re-running import only adds NEW accounts not already in the system
- All real metadata (name, currency, billing, threshold, billing date) auto-populated from API
- Existing toggle switch still works to enable/disable individual accounts

