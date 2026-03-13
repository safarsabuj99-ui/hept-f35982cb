

# Unassigned Spend Risks — Full Detail Page

## What We'll Build
Create a dedicated `/admin/unassigned-spend` page showing the complete list of unassigned campaigns with full details (campaign name, ad account, total spend, last active date). The "Unassigned Spend Risks" card on the Attention Required page will link to this new page.

## Changes

### 1. New page: `src/pages/UnassignedSpendRisks.tsx`
- Reuses the same data-fetching logic from `UnassignedSpendAlert` but enriched:
  - Fetches `daily_ad_spend` with `ad_account_id`, joins against `ad_accounts` to get account name/platform
  - Cross-references `campaign_mappings` to identify unmapped campaigns
- Displays a full searchable table with columns: Campaign Name, Ad Account, Platform, Total Spend (USD), Last Active Date
- Summary KPI bar at top: Total Unassigned Spend, Number of Unassigned Campaigns
- Search/filter input to filter by campaign name
- "Map Campaigns" button linking to `/admin/campaigns`
- Mobile-responsive: cards on small screens, table on desktop

### 2. `src/pages/AttentionRequired.tsx`
- Make the "Unassigned Spend Risks" card clickable — wrap it with `onClick={() => navigate("/admin/unassigned-spend")}` or add a "View All" button
- Add cursor-pointer styling to the card

### 3. `src/App.tsx`
- Import `UnassignedSpendRisks` page
- Add route: `/admin/unassigned-spend`

### 4. `src/components/dashboard/UnassignedSpendAlert.tsx`
- Update the "Map Campaigns Now" button or add a "View All" link that navigates to `/admin/unassigned-spend`

No database changes needed.

