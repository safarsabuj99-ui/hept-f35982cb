

## Plan: TikTok Messages Preset for Campaign Analytics

### What You'll See

A new **"TikTok Messages"** preset in the campaign analytics preset selector, showing these 13 columns:

| # | Column | Status |
|---|--------|--------|
| 1 | Budget | **New** — needs new DB column + TikTok API fetch |
| 2 | Cost (Spend) | Already exists |
| 3 | Impressions | Already exists |
| 4 | Reach | Exists in DB, **not fetched by TikTok sync yet** |
| 5 | CPM | Computed (spend/impressions × 1000) |
| 6 | Clicks (destination) | Already exists |
| 7 | CPC (destination) | Computed (spend/clicks) |
| 8 | Conversations (TikTok DM) | **New** DB column + API metric |
| 9 | Cost per conversation (TikTok DM) | Computed |
| 10 | Leads (TikTok DM) | **New** DB column + API metric |
| 11 | Cost per lead (TikTok DM) | Computed |
| 12 | Conversations (Instant messaging) | **New** DB column + API metric |
| 13 | Cost per conversation (Instant messaging) | Computed |

### Implementation

**Step 1 — Database Migration**
Add 4 new columns to `daily_metrics`:
- `budget` (numeric, default 0)
- `conversations_tiktok_dm` (integer, default 0)
- `leads_tiktok_dm` (integer, default 0)
- `conversations_instant_msg` (integer, default 0)

**Step 2 — Update TikTok Sync (`sync-deep-dive/index.ts`)**
- Add `reach`, `onsite_on_site_form_v2` (leads), and messaging metrics to the TikTok reporting API `metrics` parameter
- Fetch campaign budget from the existing `/campaign/get/` call (already fetched for status — just extract `budget` field)
- Map TikTok messaging metrics to the new DB columns during upsert

**Step 3 — Add "tiktok_messages" Preset to DeepDiveTable**
- Add `"tiktok_messages"` to `PresetType`
- New preset option in selector: "TikTok Messages"
- When selected, show exactly the 13 columns above (Budget, Cost, Impressions, Reach, CPM, Clicks, CPC, then the 6 messaging-specific columns)
- Add column definitions for Budget, Conversations (TikTok DM), Leads (TikTok DM), Cost/Lead (TikTok DM), Conversations (Instant Msg), Cost/Conv (Instant Msg)

**Step 4 — Update CampaignRow & Aggregation**
- Add `budget`, `conversations_tiktok_dm`, `leads_tiktok_dm`, `conversations_instant_msg` to `CampaignRow` interface
- Update aggregation in `CampaignMapping.tsx` and `ClientReports.tsx` to sum new fields

**Step 5 — Update `usePresetPreferences.tsx`**
- Add `"tiktok_messages"` to `PresetType`

### Files Changed

| File | Change |
|------|--------|
| `supabase/migrations/` | Add 4 columns to daily_metrics |
| `supabase/functions/sync-deep-dive/index.ts` | Add reach + messaging metrics to TikTok API, extract budget |
| `src/components/client-analytics/DeepDiveTable.tsx` | Add tiktok_messages preset, new columns, update CampaignRow |
| `src/pages/CampaignMapping.tsx` | Aggregate new fields |
| `src/pages/ClientReports.tsx` | Aggregate new fields |
| `src/hooks/usePresetPreferences.tsx` | Add tiktok_messages to PresetType |

