
# Client Dashboard Enhancements: Date Filter + Campaign Reports

## Overview
Add a comprehensive date filter to the Client Dashboard so clients can filter their transaction history, spend data, and payment requests by preset date ranges. Also add a "Reports" tab to the client navigation for a dedicated spend report view, and improve the Campaigns page with more detail.

## 1. Date Filter on Client Dashboard

Add a date filter bar below the header with these presets:
- **Today**, **Yesterday**, **This Week**, **Last Week**, **This Month**, **Last Month**, **Custom Date Range**

The filter will apply to:
- Transaction History table
- Payment Requests table  
- Spend data (KPI cards, platform breakdown, spend trend)
- Ad spend calculations

### How It Works
- A new `ClientDateFilter` component with pill buttons for each preset
- "Custom" opens a popover with two calendar pickers (From/To)
- Selected range filters all data client-side from the already-fetched datasets
- KPI cards recalculate based on the filtered period

## 2. Client Navigation Update

Update `ClientLayout.tsx` sub-nav to add:
- **Dashboard** (existing)
- **Campaigns** (existing) 
- **Reports** (new) -- links to `/dashboard/reports`

## 3. Client Reports Page (`/dashboard/reports`)

A new page showing:
- Date filter (same component reused)
- Spend breakdown table by date (daily rows showing spend per platform)
- Summary cards: Total Spend, Average Daily Spend, Top Platform
- Export-friendly clean layout

## 4. Campaign List Improvements

Enhance `MyCampaignRequests.tsx` with:
- Summary cards at top (Total Requests, Pending, Processing, Completed counts)
- Expandable row details showing creative link, ad caption, target audience, landing page URL
- Better mobile layout

## Technical Details

### New Files
- `src/components/ClientDateFilter.tsx` -- reusable date filter with presets (Today, Yesterday, This Week, Last Week, This Month, Last Month, Custom)
- `src/pages/ClientReports.tsx` -- dedicated spend report page for clients

### Modified Files
- `src/pages/ClientDashboard.tsx` -- integrate ClientDateFilter, filter transactions/spend/payments by selected date range
- `src/pages/MyCampaignRequests.tsx` -- add summary cards and expandable detail rows
- `src/components/ClientLayout.tsx` -- add "Reports" nav tab with BarChart3 icon
- `src/App.tsx` -- add route `/dashboard/reports`

### Date Filter Logic
The filter component emits a `{ from: Date, to: Date } | null` range. When null (All Time), no filtering is applied. The dashboard applies this filter to:
1. `transactions` array -- filter by `date` field
2. `adSpend` array -- filter by `date` field
3. `paymentRequests` array -- filter by `created_at` field
4. KPI recalculations use filtered data instead of hardcoded 30-day windows

### No Database Changes Required
All filtering happens client-side on already-fetched data. No new tables, columns, or migrations needed.
