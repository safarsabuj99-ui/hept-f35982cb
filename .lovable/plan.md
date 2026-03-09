

# Plan: Redesign Admin Campaign Page to Match Client-Side Design

## What Changes

Replace the current admin `CampaignMapping.tsx` table with the same design used in the client-side `ClientReports.tsx` page. This means:

1. **KPI Cards**: Replace current plain cards with the client-side style (icon bubbles with colored backgrounds, uppercase tracking labels)
2. **Add CPO KPI card** (currently missing from admin)
3. **Platform Tabs**: Add tabbed navigation (All / Meta / TikTok / Google) with count badges, matching client reports
4. **Use DeepDiveTable component**: Replace the manual `<Table>` with the existing `DeepDiveTable` component which provides:
   - Sortable columns with arrow indicators
   - CPM and Cost/Result computed columns
   - Color-coded ROAS badges
   - Totals footer row
   - Built-in search and status filter
   - Pause campaign button with confirmation dialog
   - Pagination
5. **Keep admin-only features**: Client filter dropdown and client assignment remain available (add a separate admin controls bar above the tabs)

## File Changes

### `src/pages/CampaignMapping.tsx` — Full redesign

- Import `DeepDiveTable` and `CampaignRow` from `@/components/client-analytics/DeepDiveTable`
- Import `Tabs, TabsContent, TabsList, TabsTrigger` from `@/components/ui/tabs`
- Reshape `aggregatedRows` into `CampaignRow[]` format (campaign_name, platform, status, impressions, clicks, spend, results, conversion_value, ad_account_name, campaign_id)
- Replace KPI cards with icon-bubble style matching ClientReports (Total Spend, Total Results, Avg ROAS, Avg CPO)
- Add platform tabs (All / Meta / TikTok / Google) with count badges
- Pass filtered data to `<DeepDiveTable>` per tab
- Move admin-only filters (Client dropdown, date range) into a compact controls bar above tabs
- Remove the manual table, since DeepDiveTable handles search, status filter, sorting, pagination, and totals internally

### `src/components/client-analytics/DeepDiveTable.tsx` — Minor update

- No changes needed; the component already has search, status filter, sortable columns, totals row, and pagination built in

## Result
The admin campaign page will look identical to the client-side live campaigns view, with the addition of client filter and date range controls for admin use.

