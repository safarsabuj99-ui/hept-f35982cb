

## Problem: HEPT 8 Has No Campaign/Metric Data

### Root Cause

The `sync-deep-dive` edge function times out ("CPU Time exceeded") before it reaches the HEPT 8 account. Here's the evidence:

1. **`daily_ad_spend` has data** for HEPT 8 (written by `sync-fast-lane` which is lighter) -- campaigns like `Musa/AlHaya/Sifata2/S+` with spend data from Jan-March 2026
2. **`campaigns` table has 0 rows** for HEPT 8 -- `sync-deep-dive` never creates them
3. **`daily_metrics` table has 0 rows** for HEPT 8 -- same reason
4. **`campaign_mappings` has 0 rows** for HEPT 8 -- `sync-deep-dive` creates these too
5. **Edge function logs confirm**: `sync-deep-dive` logs show it processes HEPT 15 (7596228808101986320) with 1424 rows, then Meta accounts with hundreds of rows, then hits "CPU Time exceeded" before reaching HEPT 8 (7590477811299975175)

The function already supports `platform` filtering (e.g., sync only TikTok), but even with that, it processes ALL TikTok accounts sequentially and HEPT 15 alone takes 1424 rows of processing, exhausting the CPU budget.

### Solution: Add Per-Account Sync Support

**1. Update `sync-deep-dive` edge function**
- Accept optional `ad_account_ids` array in request body to filter to specific accounts
- This allows the admin UI to trigger sync for a single account (or small batch)
- Keep existing `platform` filter working alongside it

**2. Update `sync-fast-lane` edge function**
- Same `ad_account_ids` parameter support for consistency

**3. Add "Sync This Account" button to Ad Account Detail page**
- Calls `sync-deep-dive` with `{ ad_account_ids: [accountId] }` 
- Provides targeted sync without timing out

**4. Add per-account sync to Settings page**
- In the existing Sync card, add a dropdown or button to sync individual accounts
- Particularly useful for accounts that consistently get skipped due to ordering

**5. Optimize the processing order** (secondary fix)
- Sort accounts by data volume (ascending) so smaller accounts get processed first
- HEPT 8 with ~86 rows should be processed before HEPT 15 with 1424 rows

### Changes

| File | Change |
|------|--------|
| `supabase/functions/sync-deep-dive/index.ts` | Add `ad_account_ids` filter parameter, optimize account ordering |
| `supabase/functions/sync-fast-lane/index.ts` | Add `ad_account_ids` filter parameter for consistency |
| `src/pages/AdAccountDetail.tsx` | Add "Sync Deep Dive" button that targets this specific account |
| `src/pages/Settings.tsx` | Add per-account sync option in the Sync card |

### Implementation Order
1. Update both edge functions with `ad_account_ids` filter
2. Add sync button to Ad Account Detail page
3. Add per-account sync to Settings

