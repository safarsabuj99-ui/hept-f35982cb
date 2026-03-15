

## Plan: Stop Collecting Unassigned Campaign Data

### Current State

All three sync functions (`sync-deep-dive`, `sync-fast-lane`, `sync-ad-spend`) **already skip unassigned campaigns** — they use keyword matching and `continue` when no client match is found. So no new unassigned data is being written.

However, there is **legacy unassigned data** already in the database (in `daily_ad_spend`, `campaign_mappings`, `campaigns`, `daily_metrics`) from before keyword filtering was implemented. The UI also still has an "Unassigned Spend Risk" panel and a full `/admin/unassigned-spend` page.

### What to Do

1. **Clean up legacy unassigned data from the database** via migration:
   - Delete from `daily_ad_spend` where `campaign_name` does not match any keyword in `ad_account_clients`
   - Delete from `campaign_mappings` where `client_id IS NULL`
   - Delete from `campaigns` where `client_id IS NULL` and no matching keyword exists
   - Delete orphaned `daily_metrics` rows

2. **Remove the Unassigned Spend UI** (no longer needed):
   - Remove `UnassignedSpendAlert` component from `AttentionPanel.tsx` and `AttentionRequired.tsx`
   - Remove the "Unassigned Risks" tab from `AttentionPanel`
   - Remove the `/admin/unassigned-spend` route from `App.tsx`
   - Delete `src/components/dashboard/UnassignedSpendAlert.tsx`
   - Delete `src/pages/UnassignedSpendRisks.tsx`
   - Remove navigation card from `AttentionRequired.tsx`

3. **No edge function changes needed** — all three already enforce mapping-first filtering.

### Files Changed

| File | Change |
|------|--------|
| Database migration | Delete legacy unassigned data |
| `src/components/dashboard/AttentionPanel.tsx` | Remove UnassignedSpendAlert import/tab |
| `src/pages/AttentionRequired.tsx` | Remove UnassignedSpendAlert and navigation card |
| `src/App.tsx` | Remove `/admin/unassigned-spend` route and import |
| `src/components/dashboard/UnassignedSpendAlert.tsx` | Delete file |
| `src/pages/UnassignedSpendRisks.tsx` | Delete file |

