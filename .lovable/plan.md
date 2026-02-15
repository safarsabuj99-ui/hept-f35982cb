

# Premium Admin Dashboard Redesign

## Overview
Complete redesign of the Admin Dashboard with a modern, data-rich layout featuring quick-glance KPI cards, real-time metrics, and actionable insights -- all in a clean, premium aesthetic.

## Dashboard Widgets (Top to Bottom)

### Row 1: Quick KPI Cards (6 cards in a responsive grid)
1. **Today's Ad Spend (USD)** -- Sum of `final_billable_usd` from `daily_ad_spend` where date = today
2. **Today's Collections (BDT)** -- Sum of today's credit transactions, displayed in BDT using the exchange rate
3. **Total Payment Due (BDT)** -- Sum of all client negative balances converted to BDT (clients who owe money)
4. **Total Client Balance (USD)** -- Aggregate balance across all clients
5. **Active Ad Accounts** -- Count of active ad accounts
6. **Pending Approvals** -- Count of pending transactions (clickable link to approvals page)

Each card will have:
- A subtle gradient or accent-colored top border
- An icon with a soft background circle
- The main value in large bold text
- A small comparison indicator (e.g., "vs yesterday" for spend)

### Row 2: Two-Column Layout
**Left: Profit/Loss Summary Card (enhanced)**
- Raw Cost vs Billed Amount vs Margin in a clean layout
- Margin percentage badge
- Color-coded (green for profit, red for loss)

**Right: Exchange Rate Quick Control**
- Compact inline rate display with edit capability
- Current rate shown prominently

### Row 3: Charts (Two-Column)
**Left: Spend Trend (Last 30 days)** -- Line chart (existing, polished)
**Right: Revenue vs Cost** -- Area chart comparing raw cost and billed amounts over time

### Row 4: Alerts and Activity
**Left: Low Balance Alerts** -- Compact list of clients running low on funds with days remaining
**Right: Recent Activity Feed** -- Latest transactions and sync events in a timeline format

### Row 5: Client Overview Table (enhanced)
- Sortable columns: Name, Business, Balance (USD), Balance (BDT), Today's Spend, Status indicator
- Color-coded balance badges
- Quick action buttons (view, add funds)

## Design Principles
- Glass-morphism subtle effects on cards in dark mode
- Consistent spacing using 6-unit gap system
- Monospace font for all financial numbers
- Skeleton loading states for every widget
- Real-time subscription keeps all data fresh (already implemented)
- Responsive: 1-2-3 column grid adapting to screen size

## Technical Implementation

### Files Modified
| File | Changes |
|------|---------|
| `src/pages/AdminDashboard.tsx` | Complete rewrite with new layout, KPI calculations, and enhanced data fetching |
| `src/components/ProfitLossWidget.tsx` | Enhanced with margin percentage and comparison data |
| `src/components/LowBalanceAlerts.tsx` | Compact redesign with days-remaining badges |
| `src/components/SpendTrendChart.tsx` | Visual polish, gradient fill under line |
| `src/index.css` | Add subtle utility classes for glass effects and card hover animations |

### New Components
| File | Purpose |
|------|---------|
| `src/components/dashboard/KpiCard.tsx` | Reusable KPI card with icon, value, subtitle, and trend indicator |
| `src/components/dashboard/RevenueVsCostChart.tsx` | Area chart comparing raw cost vs billed revenue over time |
| `src/components/dashboard/RecentActivityFeed.tsx` | Timeline of recent transactions, syncs, and system events |
| `src/components/dashboard/ClientOverviewTable.tsx` | Enhanced sortable client table with inline actions |

### Data Fetching Strategy
- Single `fetchDashboardData()` function that loads all needed data in parallel
- Computed metrics derived from raw data (today's spend, due amounts, etc.)
- Real-time subscriptions already in place -- no database changes needed
- "Today" calculations based on date filtering on `daily_ad_spend.date` and `transactions.date`

### No Database Changes Required
All the data needed already exists in the current tables:
- `daily_ad_spend` for ad spend metrics
- `transactions` for payments and balances
- `ad_accounts` for account counts
- `api_integrations` for sync status
- `profiles` + `user_roles` for client info

