

# Enhance Agency Ad Manager -- Gap Analysis and Improvements

## What's Already Built (No Changes Needed)
- Three-tier RBAC (Admin/Manager/Client) with RLS
- Ad accounts with platform/currency management and ON/OFF toggle
- Currency normalization engine (BDT to USD with historical snapshots)
- Campaign mapping with manual client assignment
- Admin dashboard with KPIs, charts, exchange rate control
- Client dashboard with balance, spend, platform charts, transaction history
- API integrations page with "Simulate Sync" button
- Pending approvals workflow (Manager submits, Admin approves)
- Real-time subscriptions on dashboards
- Audit logging, settings, team management

## What's Missing (To Be Implemented)

### 1. Unassigned Spend Alert on Admin Dashboard
**Problem:** If a campaign has spend but `client_id` is NULL in `campaign_mappings`, money is being spent without being billed to any client -- a revenue leak.

**Implementation:**
- Add an "Unmapped Campaign Spend" alert widget to `AdminDashboard.tsx`
- Query `daily_ad_spend` joined with `ad_accounts` and `campaign_mappings` to find campaigns with spend but no assigned client
- Display as a prominent warning card with total unassigned spend amount and a link to the Campaign Mapping page

### 2. Auto-Mapping Logic in Sync Function
**Problem:** The `sync-ad-spend` edge function generates campaigns but never auto-assigns them to clients based on keywords.

**Implementation:**
- Add a `mapping_keyword` column to the `profiles` table (e.g., "CL_Rahim") via migration
- Update the `sync-ad-spend` edge function to:
  1. After generating campaigns, check if campaign name contains any client's keyword
  2. If match found, automatically set `client_id` on the `campaign_mappings` entry
  3. Leave unmatched campaigns as NULL (showing in unmapped alerts)
- Add keyword field to the "New Client" form and client profile editing

### 3. Client Dashboard -- Mobile-First Polish
**Problem:** Current client dashboard works but isn't optimized for mobile-first bold card design.

**Implementation:**
- Redesign the top KPI cards to be larger, bolder with gradient backgrounds
- Make "Current Balance" and "Today's Spend" cards visually dominant
- Improve the platform donut chart to pull data from `daily_ad_spend` instead of transactions (more accurate)
- Add a "Remaining Funds" card showing balance minus projected daily spend

### 4. Multi-Instance API Management
**Problem:** Currently `api_integrations` stores one entry per platform. The spec calls for multiple Business Manager instances per platform.

**Implementation:**
- Add an `instance_name` column to `api_integrations` (e.g., "BM Account 1", "BM Account 2")
- Update the Integrations page UI to support adding multiple instances per platform
- Link `ad_accounts` to specific `api_integrations` entries via a new `api_integration_id` foreign key on `ad_accounts`

---

## Technical Details

### Database Migration

```sql
-- Add mapping keyword to profiles for auto-assignment
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS mapping_keyword text;

-- Add instance name to api_integrations for multi-instance support
ALTER TABLE public.api_integrations ADD COLUMN IF NOT EXISTS instance_name text DEFAULT '';

-- Add link from ad_accounts to specific api_integration
ALTER TABLE public.ad_accounts ADD COLUMN IF NOT EXISTS api_integration_id uuid REFERENCES public.api_integrations(id);
```

### Files to Modify

| File | Change |
|------|--------|
| `supabase/functions/sync-ad-spend/index.ts` | Add auto-mapping logic: after generating spend, match campaign names against `profiles.mapping_keyword` and update `campaign_mappings.client_id` |
| `src/pages/AdminDashboard.tsx` | Add "Unassigned Spend Risk" alert widget querying unmapped campaigns with active spend |
| `src/pages/ClientDashboard.tsx` | Mobile-first redesign with bold cards, improve platform chart to use `daily_ad_spend` data, add "Remaining Funds" card |
| `src/pages/NewClient.tsx` | Add "Mapping Keyword" input field |
| `src/pages/Integrations.tsx` | Support multiple instances per platform with instance naming |
| `src/pages/AdAccounts.tsx` | Add optional API integration link when creating accounts |

### New Components

| File | Purpose |
|------|---------|
| `src/components/dashboard/UnassignedSpendAlert.tsx` | Prominent warning card showing campaigns with spend but no client assignment |

### Edge Function Update
The `sync-ad-spend` function will be enhanced to:
1. Generate campaign mappings with some names containing client keywords (for demo)
2. Query all profiles with non-null `mapping_keyword`
3. For each generated campaign, check if name contains any keyword
4. Auto-assign matching campaigns to the corresponding client
5. Log auto-mapped vs unmapped counts in the response

