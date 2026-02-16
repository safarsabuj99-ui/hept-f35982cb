

# Fix: Auto-Populate Billing Data for Imported Ad Accounts

## Problem

When ad accounts are auto-imported from Meta, the **threshold limit**, **next billing date**, and **current threshold spend** are not being populated because:

1. The import function relies on `funding_source_details` which rarely returns threshold billing data
2. Meta provides billing threshold info via a separate `adspaymentcycle` edge endpoint
3. After import, the `current_threshold_spend` field is **never updated** during spend syncs -- it stays at 0 forever

## Solution

Two changes are needed:

### 1. Update `auto-import-accounts` Edge Function

After fetching ad accounts via `owned_ad_accounts`, make a second API call per account to the `adspaymentcycle` endpoint:

```text
GET /v21.0/{ad_account_id}/adspaymentcycle
  ?fields=threshold_amount,created_time,end_time,amount_spent
```

This returns the current billing cycle with:
- `threshold_amount` -- the billing threshold in cents (e.g., 75000 = $750)
- `end_time` -- the next billing/charge date
- `amount_spent` -- current spend within this billing cycle (in cents)

Use this data to populate `threshold_limit`, `next_billing_date`, and `current_threshold_spend` for each imported account.

### 2. Update `sync-ad-spend` Edge Function

After syncing daily spend data, also refresh each Meta account's billing cycle info by calling the same `adspaymentcycle` endpoint. Update the `ad_accounts` table with the latest `current_threshold_spend`, `threshold_limit`, and `next_billing_date`.

This ensures the Billing Health widget always shows accurate, up-to-date threshold usage.

## Files Changed

| File | Change |
|------|--------|
| `supabase/functions/auto-import-accounts/index.ts` | Add `adspaymentcycle` API call per Meta account to fetch threshold, billing date, and current spend |
| `supabase/functions/sync-ad-spend/index.ts` | After syncing spend, call `adspaymentcycle` to refresh billing fields on each Meta ad account |

## Technical Details

**Meta `adspaymentcycle` API call:**
- Endpoint: `https://graph.facebook.com/v21.0/{ad_account_id}/adspaymentcycle?fields=threshold_amount,amount_spent,end_time&access_token={token}`
- `threshold_amount` and `amount_spent` are returned in **cents** -- divide by 100 for dollars
- `end_time` is a Unix timestamp or date string -- convert to `YYYY-MM-DD`
- Only applies to threshold/postpaid accounts; prepaid accounts may return empty data (handled gracefully)

**Import flow change:**
- After discovering accounts, loop through Meta accounts and call `adspaymentcycle` for each
- Merge the billing data into the account object before inserting into `ad_accounts`
- If the API call fails for an account, fall back to defaults (no crash)

**Sync flow change:**
- After all spend records are synced, batch-update `ad_accounts` with fresh billing cycle data
- This runs every sync, so the Billing Health widget stays current

