

# Combine Campaigns & Spend Report into One Page

## Problem
Two separate nav items ("Campaigns" and "Spend Report") serve overlapping purposes — both list campaigns with platform filters. The user wants a single, smarter page.

## Design
Merge into one **"Campaigns"** page (`/admin/campaigns`) using **two tabs**:

| Tab | Purpose |
|-----|---------|
| **Overview** | Campaign list with client assignment (current CampaignMapping) + status badges |
| **Spend Analytics** | Aggregated spend metrics per campaign with date range filter, KPI summary cards (current SpendReport) |

Both tabs share a **common filter bar** at the top (Platform, Client).

## Changes

### 1. `src/pages/CampaignMapping.tsx` — Rewrite as unified tabbed page
- Add `Tabs` with "Overview" and "Spend Analytics"
- **Overview tab**: Current campaign list with client assignment dropdowns (existing CampaignMapping logic)
- **Spend Analytics tab**: Date range filter + KPI summary cards (Total Spend, Campaign Count) + spend table with Impressions, Clicks, Results, Spend, Days columns (existing SpendReport logic)
- Shared filters (Platform, Client) apply to both tabs
- Single data fetch: load campaigns, daily_metrics, clients once

### 2. Remove `src/pages/SpendReport.tsx`
- Delete the file entirely

### 3. `src/App.tsx`
- Remove the SpendReport import and `/admin/spend-report` route
- Keep `/admin/campaigns` pointing to CampaignMapping

### 4. `src/components/AdminLayout.tsx`
- Remove the "Spend Report" nav item (line 25)
- The "Campaigns" nav item stays

