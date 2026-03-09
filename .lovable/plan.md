

# Plan: Redesign Ad Account Spend Tab to Match Client Reports

## Problem
The Ad Account Detail's Spend tab currently shows a basic table with raw spend rows. The user wants it to match the client-side Performance Analytics (ClientReports) design exactly.

## Changes

### `src/pages/AdAccountDetail.tsx` — Replace the Spend tab content

**Remove**: The current basic spend table, `spendData` state, `loadSpend` function, `spendPage`/`spendSize` states, and the old KPI cards (Total Spend, Avg Daily, Campaigns).

**Add**: The exact same design from `ClientReports.tsx`:

1. **Data fetching** — New `loadSpendTab` function that:
   - Fetches campaigns from `campaigns` table filtered by `ad_account_id = accountId`
   - Fetches `daily_metrics` for those campaign IDs, filtered by the selected date range
   - Enriches metrics with campaign data (same logic as ClientReports)

2. **KPI Cards** (4-column grid with icon bubbles):
   - Total Spend (DollarSign, primary)
   - Total Results (ShoppingCart, green)
   - Avg ROAS (TrendingUp, blue)
   - Avg CPO (Target, orange)

3. **Platform Tabs** — Nested tabs: All, Meta, TikTok, Google with count badges, each rendering `<DeepDiveTable>` with the filtered campaign rows

4. **Overview sub-tab** — `<SalesFunnel>` and `<PlatformComparison>` components (same as ClientReports)

5. **Imports** — Add `DeepDiveTable`, `SalesFunnel`, `PlatformComparison`, `ShoppingCart`, `Target`, `Radio` imports

### No database changes needed
All required tables (`campaigns`, `daily_metrics`) are already available.

