

# Merge Live Campaigns into Reports Page

## What Changes

1. **Remove** the "Live Campaigns" tab from `MyCampaignRequests.tsx` — revert it to just showing campaign requests (no tabs needed)
2. **Delete** `src/components/client-analytics/LiveCampaignsTable.tsx` — no longer needed
3. **Upgrade** `ClientReports.tsx` to include ad account name in the data pipeline and add a third tab "Live Campaigns" with the enhanced table
4. **Upgrade** `DeepDiveTable.tsx` — add ad account name column, platform color badges (instead of emoji), status dots, ROAS color badges, totals summary row at bottom

## File Changes

| File | Action |
|------|--------|
| `src/pages/MyCampaignRequests.tsx` | Remove tabs, LiveCampaignsTable import, revert to requests-only page |
| `src/components/client-analytics/LiveCampaignsTable.tsx` | Delete |
| `src/pages/ClientReports.tsx` | Fetch ad account names, pass to DeepDiveTable; add new "Live Campaigns" tab showing the campaign table with ad account grouping, date filter already shared |
| `src/components/client-analytics/DeepDiveTable.tsx` | Add `ad_account_name` to CampaignRow interface; add platform color badges, status dots, ROAS color-coded badges, totals summary row; keep sortable columns |

## Upgraded Reports Page Structure

- **KPI Cards**: Total Spend, Results, ROAS, CPO (unchanged)
- **Tab: Overview** — Sales Funnel + Platform Comparison (unchanged)
- **Tab: Campaign Deep Dive** — Enhanced table with ad account name, platform badges, status dots, color-coded ROAS, totals row
- **MyCampaignRequests** — Back to simple requests list with status cards, no tabs

