

# Fix: Hide Zero-Data Campaigns from Analytics Panel

## Problem
The HEPT 15 ad account shows 11 campaigns in the Spend tab, but only 4 have actual data. The 7 paused campaigns appear because they have `daily_metrics` rows with all-zero values (spend=0, impressions=0, clicks=0, results=0). These clutter the analytics view.

## Root Cause
In `src/pages/AdAccountDetail.tsx` (lines 315-348), the `spendCampaignRows` builder adds ANY campaign that has a `daily_metrics` row, regardless of whether that row contains meaningful data. Zero-spend, zero-impression rows still create entries in the table.

## Fix — `src/pages/AdAccountDetail.tsx`

After building the `map` from metrics and adding active campaigns without metrics (lines 315-348), filter out rows where **all key metrics are zero** before returning:

```typescript
return Object.values(map).filter(r =>
  r.spend > 0 || r.impressions > 0 || r.clicks > 0 || r.results > 0
);
```

This keeps:
- Active campaigns with any spend/impressions/clicks/results
- Active campaigns with no metrics rows (the fallback block on line 336 — these show with the toggle so admins can pause/enable them)

This removes:
- Paused campaigns that have only zero-value metric rows (no useful data to display)

## Impact Assessment
- **KPI totals**: Unaffected — zero values don't contribute to totals anyway
- **Campaign count badge**: Will show accurate count of campaigns with data (e.g., "All 4" instead of "All 11")
- **Other pages using CampaignAnalyticsPanel** (ClientReports, ClientDetail): Should apply the same filter for consistency — will check and update those too

## Files to Modify
- `src/pages/AdAccountDetail.tsx` — filter zero-data campaigns from `spendCampaignRows`
- Check `src/pages/ClientReports.tsx` and `src/pages/ClientDetail.tsx` for same pattern

