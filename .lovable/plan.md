

# Enterprise AdTech SaaS Platform Upgrade

## Overview
Transform the current agency management system into a full-featured AdTech SaaS platform with automated ad spend tracking, a Currency Normalization Engine, campaign mapping, and advanced analytics dashboards.

---

## Phase 1: Database Schema Changes

### New Tables

**`ad_accounts`** -- Links clients to platform-specific ad account IDs with their native currency.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| client_id | uuid | FK to profiles.user_id |
| platform_name | enum (meta, tiktok, google) | Ad platform |
| ad_account_id | text | Platform-specific ID |
| account_currency | enum (USD, BDT) | Native currency of the account |
| is_active | boolean | Default true |
| created_at | timestamptz | Auto |

**`daily_ad_spend`** -- Raw spend data fetched/simulated from APIs, with conversion logic applied.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| ad_account_id | uuid | FK to ad_accounts.id |
| date | date | Spend date |
| campaign_name | text | Campaign identifier |
| raw_spend_amount | numeric | Actual platform spend |
| raw_currency | enum (USD, BDT) | Currency of raw spend |
| exchange_rate_used | numeric | Rate at time of recording |
| final_billable_usd | numeric | Normalized USD amount |
| synced_at | timestamptz | When this was recorded |

**`api_integrations`** -- Stores API credentials per platform (encrypted at rest by the database).

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| platform | enum (meta, tiktok, google) | |
| api_token | text | Encrypted token |
| app_id | text | Platform app ID |
| is_active | boolean | Default true |
| last_synced_at | timestamptz | Last successful sync |
| updated_by | uuid | Admin who configured it |

**`campaign_mappings`** -- Maps discovered campaigns to specific clients.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| campaign_id | text | External campaign ID |
| campaign_name | text | Display name |
| platform | enum | |
| client_id | uuid | Mapped client |
| ad_account_id | uuid | FK to ad_accounts |
| is_active | boolean | |

### Settings Table Updates
Add rows for `service_margin_percentage` and rename existing rate key to `bdt_to_usd_rate` for clarity (or keep as `exchange_rate`).

### RLS Policies
- `ad_accounts`: Admin full access; managers read for assigned clients; clients read own.
- `daily_ad_spend`: Admin full access; managers read for assigned clients; clients read own (joined via ad_accounts).
- `api_integrations`: Admin-only read/write.
- `campaign_mappings`: Admin full access; managers/clients read for assigned/own.

---

## Phase 2: Currency Normalization Engine

Core logic implemented as a database function and reused in the edge function and frontend:

- **Scenario A (USD Account):** `final_billable_usd = raw_spend_amount`
- **Scenario B (BDT Account):** `final_billable_usd = raw_spend_amount / exchange_rate`
- The `exchange_rate_used` is always stored at the time of the transaction for historical accuracy.

A database function `normalize_spend(raw_amount numeric, raw_currency text, rate numeric)` will encapsulate this.

---

## Phase 3: Edge Function -- `sync-ad-spend`

A new edge function at `supabase/functions/sync-ad-spend/index.ts` that:

1. Reads active `api_integrations` and `ad_accounts`.
2. Simulates fetching campaign data from each platform (generates realistic dummy data with mixed currencies).
3. Applies the Currency Normalization Engine using the current global exchange rate.
4. Inserts records into `daily_ad_spend`.
5. Updates `last_synced_at` on `api_integrations`.

The function will be callable via a "Simulate Sync" button in the admin UI.

---

## Phase 4: New Pages and Components

### New Pages

1. **`src/pages/AdAccounts.tsx`** -- CRUD for ad accounts linked to clients. Shows platform, account ID, currency, and active status.

2. **`src/pages/Integrations.tsx`** -- Admin page to input API tokens/App IDs for Meta, TikTok, Google. Shows connection status and "Last Synced" time. Includes the "Simulate Sync" button.

3. **`src/pages/CampaignMapping.tsx`** -- UI showing fetched/simulated campaigns with a dropdown to assign each to a client. Filterable by platform.

4. **`src/pages/SpendReport.tsx`** -- Detailed daily spend report with filters (date range, platform, client). Shows raw vs billable amounts for admin, billable only for clients.

### Updated Pages

5. **`src/pages/AdminDashboard.tsx`** -- Major upgrade:
   - Profit/Loss widget (Total Raw Spend converted to base vs Total Client Billed)
   - Exchange Rate control (inline slider/input to update globally)
   - Low Balance Alerts (clients with burn rate implying <3 days of funds remaining)
   - Spend trend line chart (Recharts)
   - "Last Synced" indicator

6. **`src/pages/ClientDashboard.tsx`** -- Upgrade:
   - Unified report showing only `final_billable_usd`
   - Transparency toggle tooltip showing "Original Spend: X BDT" when enabled by admin
   - Platform breakdown pie chart (Meta vs TikTok vs Google from daily_ad_spend)
   - Spend trend over time (line chart)
   - "Last Synced" indicator

7. **`src/pages/Settings.tsx`** -- Add `service_margin_percentage` field alongside exchange rate.

### Updated Layouts

8. **`src/components/AdminLayout.tsx`** -- Add nav items: "Ad Accounts", "Integrations", "Campaigns", "Spend Report".

9. **`src/App.tsx`** -- Add routes for all new pages under `/admin/`.

---

## Phase 5: Dark Theme and Visual Polish

The project already has dark mode CSS variables defined. Implementation:

- Wrap the app with `next-themes` `ThemeProvider` (already installed) defaulting to dark.
- Add a theme toggle button in the layouts.
- Default to the dark theme for the tech SaaS look.
- Ensure all new components use semantic Tailwind classes (bg-card, text-foreground, etc.) for proper theme support.

---

## Phase 6: File Change Summary

### New Files (10)
| File | Purpose |
|------|---------|
| `src/pages/AdAccounts.tsx` | Manage ad accounts per client |
| `src/pages/Integrations.tsx` | API token management + Simulate Sync |
| `src/pages/CampaignMapping.tsx` | Map campaigns to clients |
| `src/pages/SpendReport.tsx` | Detailed spend reporting |
| `src/components/ProfitLossWidget.tsx` | P/L calculation card |
| `src/components/LowBalanceAlerts.tsx` | Burn rate warning cards |
| `src/components/SpendTrendChart.tsx` | Recharts line chart |
| `src/components/ThemeToggle.tsx` | Dark/light mode switch |
| `supabase/functions/sync-ad-spend/index.ts` | Sync simulation edge function |
| Migration SQL file | All schema changes |

### Modified Files (8)
| File | Changes |
|------|---------|
| `src/App.tsx` | Add 4 new admin routes |
| `src/components/AdminLayout.tsx` | Add 4 nav items, theme toggle |
| `src/components/ClientLayout.tsx` | Add theme toggle |
| `src/components/ManagerLayout.tsx` | Add theme toggle |
| `src/pages/AdminDashboard.tsx` | P/L widget, rate slider, alerts, charts |
| `src/pages/ClientDashboard.tsx` | Unified report, transparency toggle, spend charts |
| `src/pages/Settings.tsx` | Add service margin field |
| `src/pages/LogSpend.tsx` | Option to log with BDT amount + auto-convert |

---

## Technical Notes

- **Data Integrity:** Every `daily_ad_spend` row stores the `exchange_rate_used` at insertion time. Historical records remain accurate even when the global rate changes.
- **Burn Rate Calculation:** `avg_daily_spend = total_spend_last_7_days / 7`; `days_remaining = balance / avg_daily_spend`. Alert if < 3.
- **Normalization Formula:** For BDT accounts: `final_billable_usd = raw_spend_amount / bdt_to_usd_rate`. For USD accounts: `final_billable_usd = raw_spend_amount`.
- **Simulate Sync:** Generates 5-15 random daily_ad_spend entries across active ad accounts with realistic amounts (some BDT, some USD) to demonstrate the conversion engine.

