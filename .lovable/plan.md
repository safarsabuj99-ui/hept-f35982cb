

# Fix Campaign Status + Add Campaign Pause Button

## Problems Identified

1. **Status always "active"**: The Meta and TikTok sync functions hardcode `"active"` status on every upsert (lines 263 and 427 in `sync-deep-dive`). Only Google correctly maps status from the API. Meta and TikTok never fetch campaign status from the platform API.

2. **No pause button**: Clients need a button to pause (turn off) campaigns directly from the platform, but cannot turn them back on.

## Plan

### 1. Fix sync to fetch real campaign status

**`supabase/functions/sync-deep-dive/index.ts`**

- **Meta**: Before processing insights, fetch campaign statuses via `GET /{ad_account_id}/campaigns?fields=id,name,effective_status`. Build a status map (`ACTIVE` → "active", `PAUSED` → "paused", etc.). Use this map when calling `upsertCampaign` instead of hardcoding "active".
- **TikTok**: After fetching report data, also call TikTok Campaign API `GET /open_api/v1.3/campaign/get/` with `advertiser_id` and `fields=["campaign_id","campaign_name","operation_status"]`. Build status map (`CAMPAIGN_STATUS_ENABLE` → "active", `CAMPAIGN_STATUS_DISABLE` → "paused"). Use in `upsertCampaign`.

### 2. Create edge function to pause campaigns

**`supabase/functions/pause-campaign/index.ts`** (new)

- Accepts `{ campaign_id }` (our DB campaign UUID)
- Validates the calling user is the campaign's client (via `ad_account_clients`)
- Looks up the campaign's `platform_id`, `platform`, and `ad_account_id`
- Gets API credentials from `api_integrations`
- Calls the platform API to pause:
  - **Meta**: `POST /{campaign_id}?status=PAUSED`
  - **Google**: Campaign mutate with status `PAUSED`
  - **TikTok**: `POST /open_api/v1.3/campaign/status/update/` with `DISABLE`
- Updates `campaigns.status = 'paused'` in DB
- Logs to `audit_logs`
- Client can only pause (not resume) — function rejects `action=resume`

**`supabase/config.toml`**: Add `[functions.pause-campaign]` with `verify_jwt = false`

### 3. Add pause button to DeepDiveTable

**`src/components/client-analytics/DeepDiveTable.tsx`**

- Add `campaign_id` (our DB UUID) to `CampaignRow` interface
- Add new "Action" column with a pause/power-off button icon
- Button only shown for `status === "active"` campaigns
- On click: confirmation dialog → call `supabase.functions.invoke("pause-campaign", { body: { campaign_id } })`
- Shows loading spinner during API call, updates row status to "paused" on success
- Toast notification on success/failure

**`src/pages/ClientReports.tsx`**

- Pass `campaign_id` (DB UUID) into `CampaignRow` objects during aggregation
- Pass a `onCampaignPaused` callback to `DeepDiveTable` to refresh data after pause

### 4. Update totals row

The totals row in `DeepDiveTable` needs an extra empty `<TableCell>` for the new Action column.

## File Changes Summary

| File | Action |
|------|--------|
| `supabase/functions/sync-deep-dive/index.ts` | Fix Meta/TikTok to fetch real campaign status |
| `supabase/functions/pause-campaign/index.ts` | New — pause campaign via platform API |
| `supabase/config.toml` | Auto-updated with new function config |
| `src/components/client-analytics/DeepDiveTable.tsx` | Add `campaign_id` to interface, add Action column with pause button |
| `src/pages/ClientReports.tsx` | Pass `campaign_id` in row data, add refresh callback |

