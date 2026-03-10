

## Problem: TikTok Step 2 (Advertiser Details) Silently Fails

**Step 1 works perfectly** — the debug log confirms 3 advertiser accounts are discovered with `asset_id` values like `"7614979329147109377"`.

**Step 2 fails silently** — the `/advertiser/info/` call returns no data, but the code doesn't check for errors, so it just returns 0 accounts.

### Root Cause

Two issues in `auto-import-accounts/index.ts`, lines 148-171:

1. **Missing URL encoding** on line 150:
   ```
   advertiser_ids=${JSON.stringify(batch)}
   ```
   This produces `advertiser_ids=["7614979329147109377"]` with raw brackets/quotes in the URL. TikTok's API can't parse this correctly — the parameter needs to be URL-encoded.

2. **No error checking on Step 2 response** — if TikTok returns `code !== 0`, the code silently iterates an empty `json.data?.list`, producing 0 results with no error message.

### Fix

In `supabase/functions/auto-import-accounts/index.ts`:

**Line 150** — URL-encode the advertiser_ids parameter:
```typescript
const url = `https://business-api.tiktok.com/open_api/v1.3/advertiser/info/?advertiser_ids=${encodeURIComponent(JSON.stringify(batch))}`;
```

**After line 158** — Add error checking for Step 2:
```typescript
const json = await res.json();
if (json.code !== 0) {
  throw new Error(`TikTok advertiser/info error: ${json.message} (code ${json.code})`);
}
```

This is a two-line fix. The URL encoding ensures TikTok correctly receives the advertiser IDs, and the error check prevents silent failures.

