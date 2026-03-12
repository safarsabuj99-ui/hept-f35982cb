

# Fix: TikTok Import Only Fetching 8 of 28 Accounts

## Root Cause Analysis

Looking at the edge function logs and code, there are **two issues** causing the incomplete import:

1. **Proxy returning corrupted JSON** — The `/bc/advertiser/get/` detail call already fails with `"Unexpected non-whitespace character after JSON"`. The same proxy corruption could be truncating the `/bc/asset/get/` response, returning only a partial first page (8 of 28 accounts).

2. **Detail endpoint ignores pagination** — Line 153 hardcodes `page=1&page_size=100` for the `/bc/advertiser/get/` enrichment call. Per TikTok API limits (max `page_size=50`), this silently fails or returns partial data.

## Solution

### `supabase/functions/auto-import-accounts/index.ts`

**A. Robust JSON parsing for proxy responses**
Add a `safeJson()` helper (same pattern used in `test-connection`) that extracts valid JSON even when the proxy prepends/appends garbage characters. Apply it to ALL TikTok API fetch calls.

**B. Paginate the detail endpoint**
Change the `/bc/advertiser/get/` call from a single `page_size=100` request to a paginated loop with `page_size=50`, collecting all advertiser details across pages.

**C. Paginate the balance endpoint**
The `/advertiser/balance/get/` endpoint has a limit on how many advertiser IDs can be passed at once. Batch advertiser IDs into chunks of 20 to avoid silent truncation.

**D. Add discovery count logging**
Log the `total_number` from the BC asset response so we can verify all accounts are being discovered.

### Specific Changes

```text
auto-import-accounts/index.ts
├── Add safeJson() helper (top of file)
├── fetchTikTokAccounts()
│   ├── Replace bcRes.json() → safeJson(bcRes)  
│   ├── Log total_number from page_info
│   ├── Paginate /bc/advertiser/get/ with page_size=50 loop
│   ├── Replace detailRes.json() → safeJson(detailRes)
│   ├── Batch /advertiser/balance/get/ in chunks of 20
│   └── Replace balRes.json() → safeJson(balRes)
```

No database changes needed. No frontend changes needed.

