

# Plan: Replace Spend Tab with Full ClientReports Experience

The current Spend tab in ClientDetail is a basic table. The user wants it to match the client's `/dashboard/reports` page (ClientReports.tsx) which has KPI cards, Live Campaigns with platform sub-tabs, DeepDiveTable, SalesFunnel, and PlatformComparison.

## Approach

Refactor the Spend tab content in `src/pages/ClientDetail.tsx` to reuse the same components and data flow as `ClientReports.tsx`:

### Changes to `src/pages/ClientDetail.tsx`

1. **Add imports**: `DeepDiveTable`, `SalesFunnel`, `PlatformComparison`, `Radio`, `ShoppingCart`, `Target`, and `BarChart3` icons

2. **Update data fetching** (`loadSpendData`):
   - Also fetch `ad_accounts` names to build an `adAccountMap` (account ID → name)
   - Store `campaigns` list in state (for active campaign injection)
   - Store raw enriched metrics with campaign object attached (same shape as ClientReports)

3. **Add computed values** (same as ClientReports):
   - `campaignRows`: Aggregate metrics by campaign_id into `CampaignRow[]`, inject active campaigns with zero metrics
   - `totals`: spend, impressions, clicks, results, convValue
   - `avgRoas`, `avgCpo`
   - `platformStats` for PlatformComparison
   - Platform-filtered rows: `metaRows`, `tiktokRows`, `googleRows`
   - `activeCampaigns` count

4. **Replace Spend tab UI** (lines 742-805) with:
   - Date filter (already exists)
   - 4 KPI cards: Total Spend, Total Results, Avg ROAS, Avg CPO
   - Tabbed layout: "Live Campaigns" (with All/Meta/TikTok/Google sub-tabs using `DeepDiveTable`) and "Overview" (with `SalesFunnel` + `PlatformComparison`)

5. **Remove** old spend-related state that's no longer needed (`spendPage`, `spendSize`, `spendByPlatform`, `totalSpend` calculations)

## Files Modified

- `src/pages/ClientDetail.tsx` — Replace Spend tab content with full analytics experience matching ClientReports

