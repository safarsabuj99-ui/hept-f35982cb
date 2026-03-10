

## Problem: TikTok API Geo-Restriction (Error 41000)

The error **"Client IP address is in banned Country list (code 41000)"** means TikTok's API is rejecting requests from the server's IP address. This is a **TikTok-side geo-restriction** — the backend function runs on a server in a region that TikTok has blocked.

This is **not a code bug**. The previous fixes (page_size, URL encoding, error handling) all worked correctly — we can now see the real error clearly.

### Solution Options

**Option A — Use the BC-level endpoint instead (Recommended)**

The memory notes say the correct endpoint for discovery is `/bc/advertiser/get/` (not `/advertiser/info/`). The BC endpoint may have different geo-restrictions since it's a Business Center API. We already successfully call `/bc/asset/get/` in Step 1 without geo-block, so a BC-level endpoint for details might also work.

**Changes:**
- Replace Step 2's `/advertiser/info/` call with `/bc/advertiser/get/` which returns advertiser details under a BC context
- This endpoint takes `bc_id` + `page` + `page_size` and returns advertiser info including name, ID, and status
- Since Step 1 already works (same server, same IP), a BC-scoped endpoint is likely allowed too

In `supabase/functions/auto-import-accounts/index.ts`:
- Replace lines 146-177 (Step 2) to use `/bc/advertiser/get/?bc_id={bcId}` with filtering by the discovered advertiser IDs
- Alternatively, since `/bc/asset/get/` already returns some metadata, extract what we can from Step 1's response directly and skip the separate details call entirely — use the advertiser IDs from Step 1 and insert accounts with just the ID (name can be fetched later or left as the ID)

**Option B — Skip Step 2, use Step 1 data only (Simplest)**

Since Step 1 already discovers the 3 advertiser IDs successfully, we can create ad accounts using just the IDs from Step 1 without fetching additional details. Account names default to the advertiser ID, and currency defaults to USD.

**Changes:**
- After Step 1, directly return accounts built from the discovered advertiser IDs
- Skip the `/advertiser/info/` call entirely

### Recommendation

**Option B** is the fastest and most reliable fix. The `/advertiser/info/` endpoint is blocked, but we already have the advertiser IDs. We can import them now with basic info, and details can be enriched later.

### Implementation

In `supabase/functions/auto-import-accounts/index.ts`, replace lines 144-177:

```typescript
// Build accounts directly from discovered IDs (skip blocked /advertiser/info/ endpoint)
const accounts = advertiserIds.map(id => ({
  ad_account_id: id,
  account_name: `TikTok Advertiser ${id}`,
  account_currency: "USD",
  billing_type: "prepaid",
  threshold_limit: null,
  next_billing_date: null,
}));

return accounts;
```

This bypasses the geo-restricted endpoint entirely while still importing all 3 discovered accounts.

