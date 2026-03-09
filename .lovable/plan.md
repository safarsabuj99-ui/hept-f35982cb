

# Plan: Extract Shared Campaign Analytics Component

## Problem
The same campaign analytics design (KPI cards, platform tabs, DeepDiveTable, SalesFunnel, PlatformComparison) is duplicated in both `ClientReports.tsx` and `AdAccountDetail.tsx`. Changing one doesn't update the other.

## Solution
Extract the shared UI into a single reusable component: `CampaignAnalyticsPanel`. Any design change to this component will automatically apply everywhere it's used.

## Changes

### 1. Create `src/components/client-analytics/CampaignAnalyticsPanel.tsx`

A new component that accepts `campaignRows` and an `onRefresh` callback, then renders:
- 4 KPI cards (Total Spend, Total Results, Avg ROAS, Avg CPO)
- Live Campaigns tab with platform sub-tabs (All/Meta/TikTok/Google) using `DeepDiveTable`
- Overview tab with `SalesFunnel` and `PlatformComparison`

```typescript
interface CampaignAnalyticsPanelProps {
  campaignRows: CampaignRow[];
  onRefresh: () => void;
}
```

All the aggregation logic (totals, platform stats, platform filtering, active count) moves inside this component via `useMemo`.

### 2. Simplify `src/pages/ClientReports.tsx`
- Remove the KPI cards, tabs, and aggregation JSX
- Replace with `<CampaignAnalyticsPanel campaignRows={campaignRows} onRefresh={fetchData} />`

### 3. Simplify `src/pages/AdAccountDetail.tsx` (Spend tab)
- Remove the duplicated KPI cards, tabs, and aggregation logic (`spendTotals`, `spendPlatformStats`, `spendMetaRows`, etc.)
- Replace with `<CampaignAnalyticsPanel campaignRows={spendCampaignRows} onRefresh={loadSpendTab} />`

### Files Modified
- **New**: `src/components/client-analytics/CampaignAnalyticsPanel.tsx`
- **Edit**: `src/pages/ClientReports.tsx` — replace inline UI with shared component
- **Edit**: `src/pages/AdAccountDetail.tsx` — replace spend tab UI with shared component

