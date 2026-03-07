

# Fix: Auto-detect billing type from platform API data

## Problem
The edge function logs reveal the root cause:
- Meta API returns `funding_source_details.type = 1` (credit card), meaning this is NOT a threshold account
- The `adspaymentcycle` endpoint correctly returns an error because threshold billing doesn't apply to this account
- However, the DB still has `billing_type: threshold_postpaid` and `threshold_limit: 250` — these are stale default values, not from the API

The current code only sets `billing_type = "threshold_postpaid"` when `type === 2`, but never sets a billing type for `type === 1` (credit card) or `type === 3` (prepaid). So for non-threshold accounts, the billing type is never updated and remains whatever was manually set.

## Root Cause in Code
In `sync-billing-data/index.ts`, the `syncMetaBilling` function:
1. Only writes `billing_type` when `funding_source_details.type === 2`
2. For type 1 (credit card), it skips billing type entirely
3. The `adspaymentcycle` call fails with error 100 for non-threshold accounts, which is expected but currently logged as an error

## Changes

### 1. `supabase/functions/sync-billing-data/index.ts`
- Map ALL `funding_source_details.type` values to billing types:
  - `type 1` → `"credit_card"` (no threshold applies)
  - `type 2` → `"threshold_postpaid"` (threshold applies)
  - `type 3` → `"prepaid"`
- Only call `adspaymentcycle` when type is 2 (threshold), avoiding the API error for other account types
- For credit card accounts, extract `amount_spent` from the account-level response as the outstanding balance
- Store `payment_method` info (e.g. "VISA *9415") from `funding_source_details.display_string`

### 2. `src/pages/AdAccountDetail.tsx`
- Update the Billing tab to handle the new `"credit_card"` billing type properly
- For credit card accounts, show:
  - Outstanding balance from `amount_spent` (current cycle spend)
  - Payment method (e.g. "VISA *9415")
  - Account spending limit
- Remove the threshold-specific "You'll pay when" section for non-threshold accounts
- The `isThreshold` check already handles this — we just need the edge function to correctly set the billing type

### 3. Database consideration
- May need to add a `payment_method` column to `ad_accounts` to store the card display string (e.g. "VISA *9415") — or store it in the existing fields
- Check if current columns are sufficient

### Technical Detail
The Meta `funding_source_details.type` values:
- `1` = Credit card (pay as you go)
- `2` = Threshold / postpaid billing
- `3` = Prepaid funding

### Files to modify
- `supabase/functions/sync-billing-data/index.ts` — fix billing type detection, conditional threshold fetch
- `src/pages/AdAccountDetail.tsx` — handle credit card billing type display

