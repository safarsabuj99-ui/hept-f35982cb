

## Professional Analytics & Reporting Module

### Overview
Transform the Client Reports page (`/dashboard/reports`) from a simple spend table into a premium analytics dashboard with three major visual components: a Deep Dive Performance Table, a Visual Sales Funnel, and a Platform Comparison widget.

### 1. Database: Add Missing Columns to `campaign_performance`

Rather than creating a new table, extend the existing `campaign_performance` table with the missing fields:

- `results` (integer, default 0) -- orders/leads count
- `conversion_value` (numeric, default 0) -- total revenue generated
- `status` (text, default 'active') -- campaign status (active/paused)

This avoids data duplication since `campaign_performance` already stores impressions, clicks, spend, CTR, CPC, ROAS per campaign per day.

### 2. New Components

**A. Deep Dive Performance Table** (`src/components/client-analytics/DeepDiveTable.tsx`)
- Uses TanStack Table (`@tanstack/react-table`) for sorting and column management
- Columns: Campaign Name + Platform Icon, Status (green/grey dot), Impressions (formatted as 12.5k), CPM (computed), Results, CPO (computed), Amount Spent, ROAS with color-coded badges
  - ROAS > 3.0: Green badge ("Excellent")
  - ROAS 1.5-3.0: Yellow badge
  - ROAS < 1.5: Red badge ("Needs Attention")
- All computed metrics (CPM, CTR, CPO) calculated on the frontend with zero-division guards
- Sortable columns with click-to-sort headers

**B. Visual Sales Funnel** (`src/components/client-analytics/SalesFunnel.tsx`)
- Built with Recharts using horizontal stacked bars styled as a funnel
- Three layers: Impressions (100% width) -> Clicks (CTR-based width) -> Results/Orders (conversion rate width)
- Tooltips showing conversion rate between each step (e.g., "1.5% clicked the ad")
- Gradient fills for each layer

**C. Platform Comparison Card** (`src/components/client-analytics/PlatformComparison.tsx`)
- Side-by-side comparison of Meta vs TikTok vs Google
- Metrics: Average CPO, Total Spend, Total ROAS
- Auto-highlights the "Winner" platform per metric with a trophy icon
- Shows insight text like "Meta is giving you 20% cheaper orders"

### 3. Updated Reports Page

Replace the existing `ClientReports.tsx` with a tabbed layout:
- **Tab 1: "Overview"** -- KPI summary cards (Total Spend, Total Results, Avg ROAS, Avg CPO) + Platform Comparison card + Sales Funnel
- **Tab 2: "Campaign Deep Dive"** -- The full TanStack Table with sorting
- Keeps the existing date filter at the top
- Data sourced from `campaign_performance` table (already has client RLS policies)

### 4. Dependencies

- Install `@tanstack/react-table` for the sortable performance table
- Recharts is already installed for the funnel chart

### 5. Technical Details

**Files to create:**
- `src/components/client-analytics/DeepDiveTable.tsx`
- `src/components/client-analytics/SalesFunnel.tsx`
- `src/components/client-analytics/PlatformComparison.tsx`

**Files to modify:**
- `src/pages/ClientReports.tsx` -- Complete rewrite with the new analytics module

**Database migration:**
```sql
ALTER TABLE campaign_performance
  ADD COLUMN IF NOT EXISTS results integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS conversion_value numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
```

**Zero-division handling:**
All computed metrics use safe division:
- `CPM = impressions > 0 ? (spend / impressions) * 1000 : 0`
- `CTR = impressions > 0 ? (clicks / impressions) * 100 : 0`
- `CPO = results > 0 ? spend / results : 0`
- `ROAS = spend > 0 ? conversion_value / spend : 0`

**Currency:** All monetary values displayed in USD with `$` prefix using the existing `fmt()` helper pattern.

