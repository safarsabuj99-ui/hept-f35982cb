

# Plan: Add Manual API Sync Control Panel to Settings

## What

Add a dedicated "API Data Sync" card to the Settings page with buttons to manually trigger each sync edge function. This gives you instant, on-demand control to test data collection without waiting for scheduled syncs or navigating to different pages.

## Implementation

### File: `src/pages/Settings.tsx`

Add a new card with buttons for all 4 sync functions:

| Button | Edge Function | Purpose |
|--------|--------------|---------|
| **Fast Lane Sync** | `sync-fast-lane` | Quick campaign metrics (daily_metrics) |
| **Deep Dive Sync** | `sync-deep-dive` | Detailed campaign performance data |
| **Full Ad Spend Sync** | `sync-ad-spend` | Complete daily_ad_spend records |
| **Billing Radar** | `billing-radar` | Billing threshold checks |

Each button will:
1. Show a loading spinner while running
2. Display success/failure toast with details (rows synced, errors)
3. Have independent state so multiple syncs can be tracked
4. Include a "Sync All" button that runs all functions sequentially

The card will also show the last sync timestamp from `api_integrations.last_synced_at`.

### UI Layout

```text
┌─────────────────────────────────┐
│ ⚡ Manual API Sync              │
│ Trigger data collection instantly│
│                                 │
│ [▶ Fast Lane]  [▶ Deep Dive]   │
│ [▶ Ad Spend]   [▶ Billing]     │
│                                 │
│ [━━━━━ Sync All ━━━━━]         │
│                                 │
│ Last synced: Mar 9, 2:30 PM    │
└─────────────────────────────────┘
```

### Changes Summary

Only **one file** modified: `src/pages/Settings.tsx` — add the sync control card with 4 individual sync buttons + 1 "Sync All" button, each invoking the corresponding edge function.

