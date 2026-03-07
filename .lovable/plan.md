

# Fix: Active Campaigns Always Visible in Live Campaigns

## Problem
Currently, `campaignRows` is built exclusively from `daily_metrics` results. If an active campaign has no metrics for the selected date range, it won't appear in the Live Campaigns table at all.

## Solution
After building `campaignRows` from metrics data, iterate over all fetched `campaigns` and inject any **active** campaigns that are missing from the map with zeroed-out metrics. This ensures every active campaign always appears in the table regardless of whether it has spend data for the selected period.

## Changes

### `src/pages/ClientReports.tsx`

1. **Store campaigns list in state** — add a `campaigns` state variable so it's available in the `useMemo` that builds `campaignRows`.

2. **Update `campaignRows` useMemo** — after aggregating metrics, loop through all campaigns with `status === 'active'` and add any that aren't already in the map with zero metrics:

```typescript
// After the existing metrics aggregation loop:
for (const c of campaigns) {
  if (c.status === 'active' && !map[c.id]) {
    map[c.id] = {
      campaign_name: c.name || "Unknown",
      platform: c.platform || "unknown",
      status: "active",
      ad_account_name: adAccountMap[c.ad_account_id] || "",
      campaign_id: c.id,
      impressions: 0, clicks: 0, spend: 0, results: 0, conversion_value: 0,
    };
  }
}
```

This is a small change — add one state variable and ~10 lines in the useMemo. No database or backend changes needed.

