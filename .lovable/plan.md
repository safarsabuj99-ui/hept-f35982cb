# Fix: Import Partner-Shared Meta Ad Accounts from BM

## Root Cause

`supabase/functions/auto-import-accounts/index.ts` → `fetchMetaAccounts()` only calls Meta's `/{business_id}/owned_ad_accounts` endpoint. This returns **only ad accounts owned by the BM**. Ad accounts shared with the BM as a **partner/client** (added via "Request Access" or another BM sharing theirs) live under a different endpoint: `/{business_id}/client_ad_accounts`.

Even after granting System User + App access to a partner ad account, it won't show up in the import because we never ask Meta for the partner list.

## Fix

Update `fetchMetaAccounts(appId, token)` to fetch **both** endpoints in parallel and merge:

1. `GET /v21.0/{business_id}/owned_ad_accounts?fields=...&limit=500`
2. `GET /v21.0/{business_id}/client_ad_accounts?fields=...&limit=500`

Merge into a single list, dedupe by `account_id` (owned wins if duplicated), then continue with the existing per-account billing-cycle enrichment loop.

Add graceful handling:
- If `client_ad_accounts` returns 403 / permission error (System User lacks BM-level partner-read scope), log a warning but still return owned accounts — do not fail the whole import.
- Tag each imported account with its source (`ownership: 'owned' | 'partner'`) internally for logs; DB schema stays unchanged (no column added — out of scope unless requested).

Also handle pagination for both endpoints (`json.paging.next`) with a max of ~10 pages, since a BM with many partner accounts can exceed 500. Keep the current 500-limit request but follow `paging.next` if present.

## Technical Details

- File: `supabase/functions/auto-import-accounts/index.ts`
- Function edited: `fetchMetaAccounts()`
- New helper: `fetchMetaAccountList(businessId, edge, token)` that handles pagination + returns raw account objects; called twice (`owned_ad_accounts`, `client_ad_accounts`).
- Existing enrichment (`fetchMetaBillingCycle`, funding source parsing, currency, ID normalization) is applied uniformly to the merged list — no behavior change there.
- No schema changes. No frontend changes. No changes to TikTok / Google branches.

## Out of Scope

- Showing "owned vs partner" badge in the UI (can add later if you want).
- Changing preview/quota logic in `AdAccounts.tsx`.
- Fixing TikTok BC partner discovery (only asked about Meta partner accounts here — confirm if you also want TikTok/Google reviewed).

## Verification

After deploy: run "Fetch Ad Accounts" in Ad Accounts settings for the Meta integration. Partner ad accounts (where your BM is listed as *Partner*, not *Owner*) should now appear in the preview list, provided the System User has access and the app is authorized on them.
