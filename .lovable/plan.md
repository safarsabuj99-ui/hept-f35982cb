## Smarter, more workable P&L Overview

Make the P&L tab a real decision tool — not just 8 number cards. Add comparison, trend, drill-down, and AI-style insights, while reducing visual clutter.

### Problems today
- 8 stat cards stacked the same size — eye doesn't know where to look.
- No comparison vs previous period — a number alone says nothing.
- No trend chart — can't see if today is better/worse than the week.
- Client Profitability table is flat — no losers/winners highlight, no sort, no search.
- Insights (e.g. "margin dropped 12%", "WAC spiked", "X client is losing money") all live in the user's head.

### New layout (top → bottom)

```text
┌─ Hero strip: Take-Home Profit (big) + delta vs prev period + sparkline ─┐
├─ Compact KPI row (4 cards): Revenue, Gross, Net, Margin% ──────────────┤
│   each with: Δ% vs prev period, mini trend bar                          │
├─ Smart Insights panel (auto-generated bullets) ─────────────────────────┤
│   • "Margin down 8% vs last week — driven by WAC spike to 130"          │
│   • "Top client X = 42% of profit (concentration risk)"                 │
│   • "Y client is loss-making for 3rd day"                               │
├─ Tabs: [Waterfall] [Trend] [Clients] ───────────────────────────────────┤
│   - Waterfall: existing summary row, compacted                          │
│   - Trend: 30-day stacked area (Revenue / COGS / OpEx / Net)            │
│   - Clients: searchable, sortable table + winners/losers highlight      │
└─────────────────────────────────────────────────────────────────────────┘
```

### Smart features

1. **Period comparison** — every KPI shows Δ vs previous equivalent period (Today vs Yesterday, This Week vs Last Week, etc.). Computed by re-running aggregation for the prior range.
2. **Sparkline / trend** — 30-day daily Net Profit mini-chart in the hero card; full trend chart in the Trend tab using `recharts` (already in project).
3. **Insights engine** (deterministic, not LLM): a small `insights.ts` helper that emits bullets when:
   - Margin Δ > ±5% vs prev period
   - WAC moved > 3 BDT vs prev period
   - Single client > 35% of total profit (concentration warning)
   - Any client with negative profit for current period
   - OpEx > 25% of Gross Profit
   - Take-Home < 0
4. **Client table upgrade**:
   - Search box + sortable columns (profit, margin, spend)
   - "Winners" (top 3 by profit) and "Watchlist" (margin < 5% or negative) chips
   - Click row → opens existing client detail
5. **Quick period chips compacted** — keep current `DateRangeFilter`, add inline "vs previous" toggle.
6. **Owner's Draw + Take-Home** demoted into the Waterfall tab (less noise on first view).

### Technical changes

**New files**
- `src/components/finance/PnlHero.tsx` — big Take-Home card + sparkline + delta.
- `src/components/finance/PnlKpiRow.tsx` — 4 compact KPI cards with Δ.
- `src/components/finance/PnlInsights.tsx` — renders the bullet list.
- `src/components/finance/PnlTrendChart.tsx` — 30-day stacked area (recharts).
- `src/components/finance/ClientProfitTable.tsx` — search + sort + chips.
- `src/lib/finance/insights.ts` — pure function `buildInsights({current, previous, clients, wac, prevWac})`.
- `src/lib/finance/aggregate.ts` — extract the existing fetch/aggregate logic from `FinanceDashboard.tsx` into a reusable async function `aggregateFinance(range)` returning `{revenue, cogs, opex, draw, netProfit, takeHome, wac, clients, dailySeries}`.

**Edited**
- `src/pages/FinanceDashboard.tsx` — slim down to: fetch current + previous period in parallel via `aggregateFinance`, fetch 30-day daily series for trend/sparkline, then compose the new components inside `Tabs`.

**Data**
- Reuse existing tables: `usd_purchases`, `agency_expenses`, `daily_metrics`, `campaigns`, `profiles`, `agency_accounts`, `liquid_fund_entries`, `cash_withdrawals`, `cash_withdrawal_returns`. No schema changes.
- For 30-day daily series: one extra `daily_metrics` + `agency_expenses` query grouped by `data_date` / `date` client-side.
- Previous period range derived from preset (Today→Yesterday, This Week→Last Week, etc.). Custom range → previous block of equal length immediately before.

**Permissions**
- Insights and profit-related cards keep gating behind `can_view_profit`.

### Out of scope
- No DB migrations.
- No backend / edge function changes.
- No changes to other Finance tabs (Wallet & USD, Expenses, Cash Flow).
