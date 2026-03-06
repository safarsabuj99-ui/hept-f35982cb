

# Fix Missing Tab Content in ClientReports

## Problem
When the "Campaign Deep Dive" tab was removed, the `TabsContent` blocks for both "Live Campaigns" and "Overview" were accidentally removed too. The `Tabs` component now only has trigger buttons with no content panels, so nothing renders below the tabs.

## Plan

### `src/pages/ClientReports.tsx`
Add back the `TabsContent` blocks inside the `Tabs` component:

- **`TabsContent value="live"`**: Render `<DeepDiveTable data={campaignRows} onCampaignPaused={fetchData} />` — this is the full campaign table with search, status filter, pagination, and pause functionality.
- **`TabsContent value="overview"`**: Render the `<SalesFunnel>` and `<PlatformComparison>` components with the existing `totals` and `platformStats` data.

The fix is simply moving the closing `</Tabs>` tag from line 249 down to after the two `TabsContent` blocks, and adding the content panels back in.

| File | Change |
|------|--------|
| `src/pages/ClientReports.tsx` | Add `TabsContent` for "live" (DeepDiveTable) and "overview" (SalesFunnel + PlatformComparison) inside the Tabs component |

