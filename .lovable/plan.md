

# HEPT 15 Data Collection Issues — Root Cause Analysis & Fix

## Root Cause Findings

After deep investigation of the HEPT 15 TikTok account (7596228808101986320), I found **two distinct bugs**:

### Bug 1: Missing `campaign_mappings` entries (causes "unassigned" false positives)
- HEPT 15 has **24 campaigns**, ALL containing "Musa" in the name
- The keyword mapping is "Musa" → client "musa test"
- The `sync-deep-dive` function correctly matches these campaigns and sets `client_id` on the `campaigns` table
- **BUT** it does NOT create corresponding `campaign_mappings` entries
- **10 campaigns** have `client_id` correctly set in `campaigns` but are missing from `campaign_mappings`
- This makes them appear as "unassigned" on the Unassigned Spend Risks page, and the `auto_debit_on_spend` trigger also uses `ad_account_clients` (not `campaign_mappings`), so billing may work, but reporting is wrong

### Bug 2: TikTok report API pagination missing (causes data loss)
- TikTok API is called with `page_size: "500"` but **no pagination loop**
- For an account with many campaigns × many days, this truncates results at 500 rows
- HEPT 15 has only **90 metric rows** across 24 campaigns — suspiciously low, confirming data truncation
- This affects **both** `sync-fast-lane` and `sync-deep-dive` for TikTok

### Impact on other accounts
- Bug 1 affects ALL platforms (Meta, Google, TikTok) — any campaign matched by keyword but created fresh by deep-dive will lack a `campaign_mappings` row
- Bug 2 only affects TikTok accounts with high campaign counts or long date ranges

## Changes

### 1. Fix `sync-deep-dive` — Auto-create `campaign_mappings` (all platforms)
After the `upsertCampaign()` call succeeds and `clientId` is resolved, add an upsert into `campaign_mappings`:
```typescript
// After upsertCampaign succeeds:
await supabase.from("campaign_mappings").upsert({
  campaign_id: campaignDbId,
  campaign_name: campaignName,
  platform: platform,
  client_id: clientId,
  ad_account_id: account.id,
  is_active: true,
}, { onConflict: "campaign_id" });
```
This will be added in three places: after the Meta upsertCampaign block (~line 474), after Google (~line 571), and after TikTok (~line 760).

### 2. Fix `sync-deep-dive` — Add TikTok report pagination
After each 30-day chunk fetch, check `cJson.data.page_info.total_page` and loop through pages:
```typescript
let page = 1;
let totalPages = 1;
do {
  // ... existing fetch with added page param
  bcParams.set("page", String(page));
  // ... fetch
  totalPages = cJson.data?.page_info?.total_page || 1;
  allTiktokRows = allTiktokRows.concat(cJson.data?.list || []);
  page++;
} while (page <= totalPages);
```

### 3. Fix `sync-fast-lane` — Add TikTok report pagination
Same pagination fix as above, applied to the fast-lane TikTok section (~line 349-405).

### 4. Fix `sync-fast-lane` — Auto-create `campaign_mappings`
After keyword matching succeeds in fast-lane, also upsert `campaign_mappings` to keep the mapping table in sync. This ensures campaigns discovered by fast-lane (which runs more frequently) also get properly mapped.

### 5. One-time data backfill
After deploying the fixes, advise the user to:
- Run a TikTok Deep Dive sync from Settings to re-fetch all HEPT 15 data with pagination
- The 10 previously "unmapped" campaigns will automatically get `campaign_mappings` entries

### Files Modified
- `supabase/functions/sync-deep-dive/index.ts` — add campaign_mappings upsert + TikTok pagination
- `supabase/functions/sync-fast-lane/index.ts` — add campaign_mappings upsert + TikTok pagination

No database changes needed — `campaign_mappings` table already has the right schema.

