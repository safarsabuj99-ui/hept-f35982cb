

# Platform-Separated Live Campaigns in Client Reports

## What
Split the current "Live Campaigns" tab into three platform-specific sub-tabs — **Meta**, **TikTok**, and **Google** — so clients see each platform's campaigns in a dedicated view with its own totals and pagination.

## How

### Update `ClientReports.tsx`
- Replace the single `<DeepDiveTable data={campaignRows} />` inside the "Live Campaigns" tab with a nested `Tabs` component containing three sub-tabs: Meta, TikTok, Google
- Filter `campaignRows` by platform for each sub-tab: `campaignRows.filter(r => r.platform === "meta")`, etc.
- Each sub-tab renders its own `<DeepDiveTable>` instance with only that platform's data
- Show a badge count on each sub-tab label indicating how many active campaigns exist per platform
- Add an "All Platforms" sub-tab as the default so clients can still see everything combined
- Update the KPI cards to stay global (across all platforms) since they sit above the tabs

### No changes to `DeepDiveTable.tsx`
The existing component already handles filtering, sorting, pagination, and totals row independently — passing filtered data per platform works out of the box.

### Visual Structure
```text
[Live Campaigns] [Overview]
  ├─ [All] [Meta (3)] [TikTok (2)] [Google (1)]   ← nested sub-tabs
  │    └─ DeepDiveTable (filtered to platform)
```

### Files
| File | Change |
|------|--------|
| `src/pages/ClientReports.tsx` | Add nested platform sub-tabs inside Live Campaigns tab, each with filtered DeepDiveTable |

