

# Per-Platform Profit Breakdown — Plan

## What You Want
- Show profit broken down by **each platform** (Meta, TikTok, Google) per client, not just a single total
- Add a **"Profit" tab** on the Client Detail page showing per-platform profit for that specific client
- Keep the existing total profit view on the admin dashboard

## Changes

### 1. New Component: `src/components/ClientProfitTab.tsx`
A dedicated component that receives a `clientId` prop and displays:
- **3 Platform Profit Cards** (Meta, TikTok, Google) — each showing:
  - Spend (USD)
  - Billing Rate (BDT/USD)
  - WAC (Cost Rate)
  - Gap (Rate - WAC)
  - Profit (BDT) = Spend × Gap
  - Margin %
- **Total Summary Row** at the bottom with combined figures
- Color-coded: green for positive profit, red for negative
- Data source: `daily_metrics` → `campaigns` (for platform) → `ad_account_clients` (for client mapping) + `usd_purchases` (WAC) + `profiles` (billing rates)

### 2. Update: `src/pages/ClientDetail.tsx`
- Add a 7th tab: **"Profit"** with a `TrendingUp` icon
- Change tabs grid from `grid-cols-6` to accommodate 7 tabs
- Render `<ClientProfitTab clientId={userId} />` inside the new tab content

### 3. Update: `src/components/dashboard/ProfitabilityTable.tsx`
- Add **per-platform columns** to the existing admin table: expand each client row to show platform-level breakdown
- Use an expandable/collapsible row pattern: click a client row to reveal Meta/TikTok/Google sub-rows with individual spend, revenue, cost, profit
- Keep the existing total row as the summary line

### File Summary

| File | Change |
|------|--------|
| `src/components/ClientProfitTab.tsx` | **New** — Per-platform profit cards for a single client |
| `src/pages/ClientDetail.tsx` | Add "Profit" tab triggering the new component |
| `src/components/dashboard/ProfitabilityTable.tsx` | Add expandable per-platform sub-rows under each client |

