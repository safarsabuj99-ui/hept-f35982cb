# Active Profitability Page

A dedicated page showing **only ad accounts with currently-running campaigns**, with profit broken down **per ad account** and **per client**. Opens when the "Profitability View" card on the Admin Dashboard is clicked.

## What the user will see

Route: `/admin/profitability`

Layout (top → bottom):

1. **Header** — title "Active Profitability", date range filter (defaults to Today, reuses `DateRangeFilter`), refresh button.
2. **KPI strip (4 cards)** — Active Ad Accounts count, Active Clients count, Total Spend (USD), Total Profit (BDT) with margin %.
3. **View toggle** — pill tabs: `By Client` | `By Ad Account`.
4. **Table** — columns depend on tab:
   - **By Client**: Client · Active Accounts · Spend USD · Revenue BDT · Cost BDT · Profit BDT · Margin %. Expandable row → per-ad-account breakdown (account name, platform, spend, profit, margin, active campaign count).
   - **By Ad Account**: Ad Account · Platform · Client · Active Campaigns · Spend USD · Revenue BDT · Cost BDT · Profit BDT · Margin %. Row click → navigate to `/admin/ad-accounts/:id`.
5. **Search + platform filter + sort** on the table. Pagination (default 20/page).

## "Active" definition

An ad account is considered active in the selected range if it has **at least one campaign whose `isActiveStatus(status)` is true AND that campaign has spend > 0 in the range**. This filters out paused/archived accounts and truly idle ones — the same rule the Campaign hub already uses.

## Data flow (single RPC for speed)

Add a new Postgres function `get_active_profitability(p_date_from, p_date_to, p_org_id)` returning JSON with two arrays: `by_client` and `by_account`. Server-side aggregation avoids fetching thousands of `daily_metrics` rows to the browser.

Steps inside the RPC:

```text
1. WAC := weighted avg (bdt_paid / usd_received) from usd_purchases in range,
   with cascading fallback (range → current month → all-time), mirroring
   ProfitabilityTable + aggregateFinance.
2. Active campaigns := campaigns where isActiveStatus(status) is true.
3. Spend rows := daily_metrics joined to active campaigns in date range,
   grouped by (ad_account_id, client_id, platform).
4. Revenue BDT per group := spend_usd * platform_rate(client.pricing_config, platform)
   (+ optional percentage markup if set), matching aggregateFinance logic.
5. Cost BDT := spend_usd * WAC.
6. Emit by_account rows and by_client rollups (sum of that client's accounts).
7. Include active_campaign_count per account/client from step 2.
```

Frontend calls the RPC once per date change and renders both views from the same payload.

## Dashboard entry point

`src/components/dashboard/ProfitabilityTable.tsx` — wrap the `CardHeader` (or the whole card) in a clickable link to `/admin/profitability`, add a small "View all →" affordance in the header. No behavior change to the existing preview table.

## Files to add / change

- **new** `supabase/migrations/<ts>_active_profitability_rpc.sql` — creates `public.get_active_profitability(...)` as `SECURITY DEFINER`, `GRANT EXECUTE` to `authenticated`, org-scoped via `p_org_id`.
- **new** `src/pages/ActiveProfitability.tsx` — page component (header, KPIs, tabs, tables, pagination, search).
- **new** `src/hooks/useActiveProfitability.ts` — react-query hook wrapping the RPC, gated with `authReady && !!orgId`, `staleTime 60s`, invalidated on realtime `daily_metrics` / `campaigns` inserts (debounced, same pattern as `useAdminDashboardData`).
- **edit** `src/App.tsx` — register `/admin/profitability` inside the admin layout with `ProtectedRoute` + `can_view_profit` permission gate.
- **edit** `src/components/dashboard/ProfitabilityTable.tsx` — make the card header a link to the new page; keep the existing top-5 preview.

## Technical details

- Currency: spend in USD, revenue/cost/profit in BDT — matches existing memory (Currency Display Policy).
- Rates: use `getPlatformRates(pricing_config)` semantics inside SQL by reading `flat_rates → platform_rates → 120` fallback.
- Permission: page hidden/blocked unless `can_view_profit` is true (same as `ProfitabilityTable`).
- Performance: one RPC, indexes already exist on `daily_metrics(campaign_id, data_date)` and `campaigns(ad_account_id, status)`; no client-side N+1.
- Design: reuses `Card`, `Table`, `Badge`, `Tabs`, `TablePagination` primitives — no new design tokens.
