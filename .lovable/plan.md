

# Revamp Campaigns Page: Remove Overview Tab & Enhance Spend Analytics

## Current State
The Campaigns page has two tabs: "Overview" (campaign-to-client assignment table) and "Spend Analytics" (aggregated metrics). The user wants to remove Overview and build a more powerful single-view analytics + management page.

## Plan

### Remove Overview Tab & Merge Assignment into Analytics
Remove the tab system entirely. The page becomes a single unified view with enhanced spend analytics and inline campaign management.

### File: `src/pages/CampaignMapping.tsx`

**1. Remove Overview tab, pagination state, and related code**
- Delete `overviewPage`, `overviewSize` state
- Remove `Tabs`/`TabsList`/`TabsTrigger` wrapper — render spend analytics directly
- Remove the Overview `TabsContent` block entirely

**2. Enhance Spend Analytics Table with Management Columns**
Move the client assignment dropdown into the spend analytics table so admins can assign campaigns without a separate tab:
- Add "Status" column with color-coded badges (active=green, paused=yellow, etc.)
- Add "Assigned Client" column with inline `Select` dropdown (from the old Overview tab)
- Add "CTR" and "ROAS" calculated columns
- Add "Ad Account" column showing which account the campaign belongs to

**3. Add KPI Summary Cards Row**
Expand from 2 KPI cards to 4:
- Total Spend (USD)
- Total Impressions
- Total Clicks
- Avg. ROAS

**4. Add Search Filter**
Add a search input above the table to filter campaigns by name, platform ID, or client name — same pattern used on Ad Accounts page.

**5. Add Status Filter**
Add a status filter dropdown (All, Active, Paused, Not Delivering) alongside existing Platform and Client filters.

**6. Fetch Ad Account Names**
Query `ad_accounts` to show account names in the table, joined via `campaign.ad_account_id`.

### Data Flow
```text
Filters: [Search] [Platform] [Client] [Status] [Date Range]
         ↓
KPIs:   [Total Spend] [Impressions] [Clicks] [Avg ROAS]
         ↓
Table:  Campaign | Ad Account | Platform | Client (assign) | Status | Impressions | Clicks | CTR | Results | ROAS | Spend | Days
```

### Summary of Removals
- Tab system (`Tabs`, `TabsList`, `TabsTrigger`, both `TabsContent`)
- `overviewPage` / `overviewSize` state
- `filteredCampaigns` memo (no longer needed separately)
- `MapPin` icon import

### No database changes needed

