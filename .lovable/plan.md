## Problem

Partner ad accounts (shared with HEPT's BM by another business) are completely missing from Fetch results. The current `fetchMetaAccounts()` in `supabase/functions/auto-import-accounts/index.ts` queries two edges (`owned_ad_accounts` + `client_ad_accounts`), but:

1. **`client_ad_accounts` errors are swallowed** — a `console.warn` + `return []` means a 403 / token-scope / permission failure looks identical to "no partner accounts exist". The user sees nothing.
2. **Not every "partner-shared" account lives under `client_ad_accounts`.** Depending on how the sharing was set up on Meta's side (BM-to-BM partner share vs. agency/client relationship), the account can instead surface via:
   - `/{business_id}/agencies` → then `/{agency_business_id}/owned_ad_accounts`
   - or only via the System User's direct `/me/adaccounts` edge.
3. There's no way today to tell which case we're in, because the edge function returns `errors: []` even when a partner endpoint failed.

## Fix

Scope: `supabase/functions/auto-import-accounts/index.ts` only. No schema, no frontend logic change (aside from optionally showing the new warnings that already flow through the existing `errors` array in the preview response).

### 1. Stop swallowing partner-endpoint failures

`fetchMetaAccountEdge(..., "client_ad_accounts", ...)` currently returns `[]` on any non-OK response. Change it to **throw a tagged error** (e.g. `throw new Error("client_ad_accounts: <status> <body-snippet>")`) so the outer `try/catch` in the preview loop pushes it into the `errors[]` array that the UI already renders. Owned-account fetch keeps its existing throw behaviour.

To avoid one bad edge nuking the whole integration, wrap the two edge calls in `Promise.allSettled` inside `fetchMetaAccounts` and:
- If `owned` rejects → rethrow (fatal, same as today).
- If `client` rejects → attach the error message to a `partnerFetchError` field on the returned payload and continue with owned + whatever partner rows we got.

Propagate `partnerFetchError` up to the preview response's `errors[]` so the operator sees the exact Meta API message.

### 2. Add a third discovery path: System User's direct ad accounts

Add `fetchMetaSystemUserAccounts(token)`:
- `GET /v21.0/me/adaccounts?fields=account_id,name,currency,funding_source_details,account_status,business&limit=500` (paginated, 10-page cap).
- Merge into the same dedup `Map` used today, with ownership `"system_user"` (lowest precedence: owned > partner > system_user).

Rationale: BM-to-BM partner shares where the System User was granted account-level access frequently surface here even when they don't appear under the BM's `client_ad_accounts` edge. This is the reliable fallback that matches what the user sees in Ads Manager.

### 3. Log discovery counts

Extend the existing `console.log("Meta BM fetch: owned=X, partner=Y, merged=Z")` line to also include `system_user=N` and the raw counts before dedup, so edge-function logs make it obvious which edge produced results.

### 4. No changes to

- Insert / import flow (still keyed on `ad_account_id`).
- Billing-cycle enrichment.
- TikTok / Google fetchers.
- UI — the existing preview error panel already renders `errors[]`.

## Verification

1. Deploy, then run **Fetch Ad Accounts** in Settings.
2. Expected outcomes:
   - Partner accounts now appear (via one of the three edges).
   - If Meta rejects `client_ad_accounts`, the exact error text appears in the preview's error panel instead of a silent empty result.
   - Edge-function logs show a line like `Meta BM fetch: owned=12, partner=0, system_user=8, merged=20`, telling us which edge produced the partner rows.
3. If partner accounts still don't appear, the surfaced Meta error tells us exactly which permission/scope is missing on the System User token — a follow-up fix on the Meta side, not code.
