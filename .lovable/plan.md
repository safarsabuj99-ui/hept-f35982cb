# Fix TikTok 41000 Geo-Restriction Error with Retry Logic

## Diagnosis

The code is correct -- all TikTok API calls properly route through your Cloudflare Worker proxy (`https://hept.raohas10.workers.dev`). The error `[code 41000] Client IP address is in banned Country list` means the Cloudflare Worker's **Smart Placement** is temporarily routing through a banned region (likely the same AWS Singapore region as the backend).

This is intermittent -- it worked before because Smart Placement was routing to an allowed region (US/EU). The data clearing itself didn't break anything; it's a Cloudflare routing fluctuation.

## Plan

### 1. Add retry logic with delay for TikTok 41000 errors (`sync-deep-dive/index.ts`)

Instead of immediately failing on 41000, retry up to 3 times with a short delay. Cloudflare Smart Placement often routes differently on subsequent requests.

- Wrap TikTok fetch calls (both BC and direct) in a retry helper
- On 41000 error, wait 2 seconds and retry (up to 3 attempts)
- Log each retry attempt for visibility
- Only fail after all retries exhausted

### 2. Apply same retry logic to other TikTok sync functions

Apply the same pattern to `sync-fast-lane`, `sync-ad-spend`, and `sync-billing-data` for consistency.

### Files Changed


| File                                            | Change                                                                               |
| ----------------------------------------------- | ------------------------------------------------------------------------------------ |
| `supabase/functions/sync-deep-dive/index.ts`    | Add `fetchWithRetry` helper for TikTok 41000 errors; use it for all TikTok API calls |
| `supabase/functions/sync-fast-lane/index.ts`    | Same retry helper                                                                    |
| `supabase/functions/sync-ad-spend/index.ts`     | Same retry helper                                                                    |
| `supabase/functions/sync-billing-data/index.ts` | Same retry helper                                                                    |


### Key Code Pattern

```typescript
async function tiktokFetchWithRetry(url: string, headers: Record<string, string>, maxRetries = 3): Promise<any> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, { headers });
    const json = await res.json();
    if (json.code === 41000 && attempt < maxRetries) {
      console.warn(`TikTok 41000 on attempt ${attempt}, retrying in 2s...`);
      await new Promise(r => setTimeout(r, 2000));
      continue;
    }
    return json;
  }
}
```

This is a resilient, backward-compatible fix that handles the intermittent Cloudflare routing issue without any infrastructure changes needed.