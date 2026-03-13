

# Unassigned Spend Risks — Revised Data Source, Assign Action & Date Filter

## Current Problem
The page currently pulls from `daily_ad_spend` and checks against `campaign_mappings`. But per the ingestion policy, data only exists for ad accounts with active client assignments. The real "unassigned" campaigns are those in the `campaigns` table (synced via API) that lack a corresponding `campaign_mappings` entry with a `client_id` — i.e., campaigns the system fetched but couldn't match to a keyword.

## What We'll Change — `src/pages/UnassignedSpendRisks.tsx`

### 1. Fix Data Source
- Fetch `campaigns` table (all synced campaigns) and `campaign_mappings` (mapped ones with `client_id`)
- Cross-reference: campaigns whose `id` is NOT in `campaign_mappings.campaign_id` (where `client_id` is not null) are "unassigned"
- Join with `ad_accounts` for account name/platform
- Fetch `daily_metrics` for those campaign IDs to get spend totals within the date range
- Also fetch `ad_account_clients` to know which clients are assigned to each ad account (for the assign dropdown)

### 2. Add Date Range Filter
- Reuse the existing `DateRangeFilter` component (same as CampaignMapping page)
- Filter `daily_metrics` by `data_date` within the selected range
- Default to "All Time"
- KPI totals and per-campaign spend update based on the selected date range

### 3. Add "Assign to Client" Action
- Each row gets an "Assign" button that opens a dialog/popover
- Dialog shows a searchable client dropdown (fetched from `profiles` + `user_roles` where role = 'client')
- On submit: insert into `campaign_mappings` with `campaign_id`, `campaign_name`, `platform`, `client_id`, `ad_account_id`, `is_active: true`
- On success: remove the campaign from the list, show toast
- Mobile cards get the same assign button

### 4. UI Layout Update
- Add `DateRangeFilter` next to the search bar in the toolbar
- Add "Assign" column to desktop table / button in mobile cards
- Add an "Action" column header

### Imports to Add
- `DateRangeFilter`, `DateRange` from `@/components/DateRangeFilter`
- `Dialog` components for the assign flow
- `Select` for client picker
- `format` from `date-fns`

### Data Flow Summary
```text
campaigns (synced via API)
  └─ LEFT JOIN campaign_mappings ON campaign_id
       └─ WHERE campaign_mappings.client_id IS NULL  →  "Unassigned"
  └─ JOIN ad_accounts for name/platform
  └─ JOIN daily_metrics (filtered by date) for spend totals
  └─ JOIN ad_account_clients for eligible clients to assign
```

No database changes needed.

