

## Problem: TikTok Import Returns 0 Accounts

The import succeeds (no errors) but finds 0 accounts. The `/bc/asset/get/` API call returns `code: 0` (success), but the code fails to extract advertiser IDs from the response because the **response structure** doesn't match what we're looking for.

### Root Cause

The code looks for `item.advertiser_id` or `item.asset_id` on each list item (line 128), but the TikTok `/bc/asset/get/` endpoint for `ADVERTISER` assets likely nests the data differently — e.g., under `item.advertiser_info.advertiser_id` or uses a different field name entirely.

Since TikTok's docs are dynamically rendered and hard to verify, we can't confirm the exact structure without seeing the actual response.

### Fix Plan

**Step 1: Add debug logging** to `auto-import-accounts/index.ts` to log the raw TikTok API response so we can see the actual data structure:

```typescript
// After line 121: const bcJson = await bcRes.json();
console.log("TikTok BC Asset response:", JSON.stringify(bcJson.data?.list?.[0] ?? "empty list"));
```

**Step 2: Broaden the advertiser ID extraction** (line 126-132) to check multiple possible field paths:

```typescript
const list = bcJson.data?.list ?? [];
for (const item of list) {
  const advId = item.advertiser_id 
    || item.asset_id 
    || item.id
    || item.advertiser_info?.advertiser_id;
  if (advId) {
    advertiserIds.push(String(advId));
  }
}
```

This covers the most common TikTok API response patterns. The debug log will tell us the exact structure on the next run, allowing a targeted fix if needed.

### What to expect

After this change, try "Sync from API" again. The console logs (visible in edge function logs) will show the actual TikTok response structure, and the broadened extraction should catch the advertiser IDs regardless of which field they're in.

