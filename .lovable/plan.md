

# Ad Account Detail Page

## Overview
Create a dedicated detail page for each ad account at `/admin/ad-accounts/:accountId`, accessible by clicking an account row in the Ad Accounts list. This page will consolidate all account data into a tabbed, editable layout -- similar to the Client Detail page pattern already established in the project.

## Page Structure

### Header
- Back link to Ad Accounts list
- Account name as page title
- Platform badge + Active/Inactive toggle
- Account ID in monospace

### 4 Tabs

**1. Details Tab** -- All editable account metadata
- Account Name (editable)
- Platform (read-only badge)
- Ad Account ID (read-only)
- Currency (editable select)
- Daily Spending Limit (editable number input)
- Billing Type (editable select: Prepaid / Threshold Postpaid)
- Threshold Limit (editable, shown only for threshold accounts)
- Current Threshold Spend (read-only display with progress bar)
- Next Billing Date (editable date input)
- Card Last 4 (editable)
- Linked Integration (read-only, shows integration instance name if api_integration_id exists)
- Active status toggle
- "Save Changes" button

**2. Clients Tab** -- Manage multi-client assignments
- Table of current client assignments showing client name, mapping keyword, and remove button
- "Add Client" form inline (client select + keyword input + assign button)
- Shows count of assigned clients

**3. Spend Tab** -- Historical spend data for this account
- Date range filter (reuse existing ClientDateFilter component)
- Summary cards: Total Spend, Average Daily, Campaign Count
- Table of daily_ad_spend records for this account with campaign name, date, raw spend, billable USD
- Sorted by most recent first

**4. Billing Health Tab** -- Threshold billing details (only meaningful for threshold accounts)
- Visual threshold usage gauge (progress bar with percentage)
- Days until next billing date countdown
- Recent billing notifications for this account
- Mark notifications as read button

## Technical Plan

### New File: `src/pages/AdAccountDetail.tsx`
- Follows the same pattern as `ClientDetail.tsx` (useParams, tabs, editable state, save handlers)
- Fetches from: `ad_accounts`, `ad_account_clients`, `daily_ad_spend`, `billing_notifications`, `api_integrations`, `profiles` (for client names)
- Updates `ad_accounts` table on save
- Manages `ad_account_clients` for assignments (insert/delete)
- Date-filtered spend query reusing `ClientDateFilter` component

### Modified File: `src/App.tsx`
- Add route: `<Route path="/admin/ad-accounts/:accountId" element={<AdAccountDetail />} />`
- Import the new `AdAccountDetail` component

### Modified File: `src/pages/AdAccounts.tsx`
- Make account rows clickable -- wrap account name or add a "View" link that navigates to `/admin/ad-accounts/${account.id}`

### Data Flow
- Load account by ID from `ad_accounts` table
- Load assignments from `ad_account_clients` where `ad_account_id` matches
- Load client profiles for name display
- Load spend from `daily_ad_spend` filtered by `ad_account_id`
- Load billing notifications filtered by `ad_account_id`
- Load integration name if `api_integration_id` is set

### No Database Changes Required
All required tables and columns already exist. The page is a read/edit UI over existing data.

