

# Live Synced Campaigns on Client Dashboard

## Problem
The `/dashboard/campaigns` page only shows manual campaign requests (ad orders). There's no way for clients to see their actual live campaigns synced from ad platforms with real-time metrics.

## Approach
Redesign the Campaigns page with **two tabs**: "Live Campaigns" (synced data) and "Campaign Requests" (existing orders). The Live Campaigns tab will show a professional, filterable table of all campaigns synced from ad accounts with the requested metrics.

## Data Availability
From `campaigns` + `daily_metrics` + `ad_accounts` tables, we can show:
- **Ad Account Name** — from `ad_accounts.account_name`
- **Campaign Name** — from `campaigns.name`
- **Status** — from `campaigns.status`
- **Impressions** — aggregated from `daily_metrics.impressions`
- **CPM** — computed: `(spend / impressions) * 1000`
- **Results (Sales)** — aggregated from `daily_metrics.results`
- **Spend** — aggregated from `daily_metrics.spend`
- **Messages** — not stored in `daily_metrics`. Will show as a column but note it requires adding a `messages` field to sync. For now, will display `results` as the primary conversion metric.

Additional computed metrics for a smarter view: **CTR**, **CPC**, **ROAS** with color-coded health badges.

## Technical Changes

| File | Change |
|------|--------|
| `src/pages/MyCampaignRequests.tsx` | Refactor into a tabbed layout: "Live Campaigns" tab (new) + "Campaign Requests" tab (existing content) |
| `src/components/client-analytics/LiveCampaignsTable.tsx` | **New** — TanStack Table showing synced campaigns with sorting, grouping by ad account, platform icons, status dots, and performance badges |

### LiveCampaignsTable Component
- Fetches `ad_account_clients` → `ad_accounts` (for account names) → `campaigns` → `daily_metrics`
- Aggregates `daily_metrics` per campaign across selected date range
- Columns: Platform icon, Ad Account, Campaign Name, Status, Impressions, CPM, Results, Spend, ROAS
- Color-coded ROAS badges (green >3x, yellow 1.5-3x, red <1.5x)
- Status shown as colored dots (active = green, paused = gray)
- Date filter integration using existing `ClientDateFilter`
- Sortable columns via TanStack Table
- Groups campaigns visually under their ad account name
- Shows summary row with totals at bottom
- Empty state when no synced campaigns exist

### MyCampaignRequests Page Restructure
- Add `Tabs` component with "Live Campaigns" and "Campaign Requests"
- Default tab: "Live Campaigns"
- Move existing campaign requests UI into the second tab
- Keep the "New Campaign" button accessible from both tabs

