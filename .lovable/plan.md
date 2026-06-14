## Problem

In TikTok ad account **HEPT AGENCY 2**, two active campaigns exist:

- `Arafat/Nakshi/Lajbonti/S+` (TikTok campaign id `1867920555407570`)
- `Arafat/Nakshi/Lajbonti/SS+` (TikTok campaign id `1867923067550866`)

Only `/SS+` shows on the agency dashboard under client **Yasin Arafat**. The `/S+` campaign is stored in our DB with its **old name** ` Arman/Womenshop/Lajbonti/S+` and therefore mis-attributed to client **Arman** (keyword `Arman`), so it does not appear under Arafat.

## Root cause

TikTok's `report/integrated/get/` endpoint returns the **historical** `campaign_name` (the name at the time of the stat row). When a campaign is renamed in the TikTok UI, the report API keeps emitting the old name until new days are recorded, while `/campaign/get/` returns the current name.

Our sync pipeline currently:

- **`sync-deep-dive`** (TikTok branch, ~line 1083): takes `campaignName` from `row.metrics.campaign_name` (historical) and feeds it to both `resolveClientId(...)` and `upsertCampaign(...)`. So the DB row keeps the stale name and stale `client_id`.
- **`sync-fast-lane`** (TikTok branch, ~line 714): same — uses `row.metrics.campaign_name` for keyword matching and inserts `daily_ad_spend` rows under the wrong `client_id`.

`/campaign/get/` is already called in `sync-deep-dive` (line 974) to fetch status, budget, and objective. We just don't capture `campaign_name` from it.

## Fix (TikTok only — minimal scope)

### 1. `supabase/functions/sync-deep-dive/index.ts`
- Inside the `/campaign/get/` loop (~line 981), additionally build:
  ```ts
  const tiktokNameMap: Record<string, string> = {};
  // for each c in statusJson.data.list:
  if (c.campaign_name) tiktokNameMap[c.campaign_id] = c.campaign_name;
  ```
- In the row-processing loop (~line 1083), replace:
  ```ts
  const campaignName = row.metrics?.campaign_name || `TikTok Campaign ${rawCampaignId}`;
  ```
  with the live name preferred:
  ```ts
  const campaignName =
    tiktokNameMap[rawCampaignId] ||
    row.metrics?.campaign_name ||
    `TikTok Campaign ${rawCampaignId}`;
  ```
  Then `resolveClientId(campaignName, platformId)` and `upsertCampaign(...)` automatically re-assign the correct `client_id` and overwrite the stale name on next deep-dive.

### 2. `supabase/functions/sync-fast-lane/index.ts`
Fast-lane runs more often than deep-dive and would keep writing wrong-client `daily_ad_spend` rows until deep-dive heals the name. Two-line guard so fast-lane trusts the corrected DB once deep-dive has run:

- Just before the keyword-matching block (~line 717), look up any existing campaign by `platform_id = tiktok_<rawCampaignId>` (we can hydrate a `Map<platformId, {name, client_id}>` once per account from a single `select platform_id, name, client_id from campaigns where ad_account_id = ...`).
- If a row exists, override `campaignName` with `existing.name` and short-circuit `matchedClientId = existing.client_id` (skip keyword loop).
- Else fall back to the current keyword-matching path (unchanged).

This makes fast-lane immediately consistent with whatever deep-dive last wrote.

### 3. One-time heal for the bad row already in DB
After deploy, the next TikTok deep-dive for HEPT AGENCY 2 will:
- read campaign `1867920555407570` → `tiktokNameMap` returns `Arafat/Nakshi/Lajbonti/S+`
- `resolveClientId` matches `Arafat` keyword → reassigns `client_id` to `41881fc6-…` (Yasin Arafat)
- `upsertCampaign` updates `name` and `client_id` on the existing row

No SQL migration needed — the existing campaign row is updated in place by `upsertCampaign`. The historical `daily_ad_spend` rows (already wrongly under Arman) are out of scope for this fix; if the user wants them re-attributed too, that's a separate cleanup (we can re-run fast-lane backfill, but `daily_ad_spend` rows are keyed by `(ad_account_id, date, campaign_name)` and that name is what's wrong).

### Out of scope
- No DB schema changes.
- Meta and Google branches are not touched (they don't show this symptom right now).
- Historical `daily_ad_spend` cleanup — call it out to the user separately if they want it.

### Files to edit
- `supabase/functions/sync-deep-dive/index.ts` — capture `campaign_name` in `tiktokNameMap`, prefer it in row loop.
- `supabase/functions/sync-fast-lane/index.ts` — hydrate per-account `existingCampaignByPlatformId` map, prefer DB name/client over report name.

### Deploy
Deploy both edge functions, then trigger one TikTok deep-dive for HEPT AGENCY 2 to heal the `/S+` row.
