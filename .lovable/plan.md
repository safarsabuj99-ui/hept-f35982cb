# Fix: Dashboard ↔ Campaign Spend Mismatch

## Root cause

The Admin Dashboard KPIs read from `daily_ad_spend.final_billable_usd` (post-markup, currency-converted, Dhaka-dated, mapped-accounts-only). The Campaign tabs / P&L / Client reports read from `daily_metrics.spend` (raw platform USD per campaign per `data_date`). These two pipelines diverge on currency conversion, markup, mapping filter and date timezone — so the numbers never match.

## Decision (from you)

- **Single source of truth:** `daily_metrics.spend` (raw platform spend in USD).
- **Mapping filter:** removed — dashboard counts spend from **all** ad accounts in the org, mapped or not.

## What changes

### 1. Database — rewrite `get_admin_dashboard_summary(p_date_from, p_date_to, p_org_id)`

Replace every read of `daily_ad_spend` with `daily_metrics`, joined to `campaigns` for org scoping. No filter on `ad_account_clients.mapping_keyword`.

```text
todaySpend / yesterdaySpend / spendHistory
  ── SUM(daily_metrics.spend)
  ── JOIN campaigns ON campaigns.id = daily_metrics.campaign_id
  ── WHERE campaigns.org_id = p_org_id
  ── AND data_date BETWEEN p_date_from AND p_date_to
```

Client-level `platform_balances` and `balance` logic in the RPC stays unchanged (those come from `transactions`, not spend).

Sparkline (`spendHistory`) regenerated over `generate_series(today-6 … today)` against `daily_metrics.data_date`.

### 2. Frontend reads that need switching to `daily_metrics`

These already use `daily_ad_spend` and will be migrated to `daily_metrics` for consistency:

- `src/components/RunwayPrediction.tsx` — burn-rate calc
- `src/components/dashboard/RevenueVsCostChart.tsx` — cost series
- `src/components/dashboard/SystemHealthWidget.tsx` — today's spend tile

Each query becomes: `daily_metrics` joined to `campaigns` (for `org_id` / `client_id` scoping when needed), summed by `data_date`.

### 3. Things that stay on `daily_ad_spend`

- The table itself is **not** dropped — it still drives Ad-Guard's per-account billable/markup math and USD inventory burn.
- Wallet debit attribution (`transactions`) continues to use the existing atomic helpers; no change to balance logic.

### 4. Timezone caveat (documented, not coded around)

`daily_metrics.data_date` comes from the platform API in the account's reporting timezone. Between Dhaka midnight and ~3 AM, "Today" may briefly show $0 while the platform still reports yesterday. This is the trade-off of using raw spend and matches what the Campaign tab already shows — so the two screens stay in sync.

## Verification

After deploy:
1. Open `/admin` with date = Today → note `Today's Spend`.
2. Open Client → Campaigns / DeepDive for same date → sum the spend column.
3. Numbers must match to the cent (modulo the timezone caveat above).
4. Repeat for Yesterday and a 7-day range.

## Technical files touched

- migration: replace `public.get_admin_dashboard_summary(date, date, uuid)` body
- `src/components/RunwayPrediction.tsx`
- `src/components/dashboard/RevenueVsCostChart.tsx`
- `src/components/dashboard/SystemHealthWidget.tsx`

No schema changes, no RLS changes, no edge function changes.
