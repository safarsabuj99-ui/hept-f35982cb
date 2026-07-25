# Active Clients & Active Ad Accounts — Premium Overview

Extend the existing **Active Profitability** page (`/admin/profitability`) with two new intelligent tabs — **Active Clients** and **Active Ad Accounts** — that surface only currently-delivering entities and the KPIs an operator needs to act on them.

## What "active" means

An entity is active only when BOTH conditions hold (strict, hides zombies):

1. Has ≥1 campaign whose status passes `isActiveStatus()` right now, AND
2. That campaign generated `daily_metrics.spend > 0` in the last 7 days.

The existing tabs (Client / Ad Account profitability) stay untouched. The new tabs are additional views optimized for "what's live right now".

## Page layout after change

```text
/admin/profitability
 ├─ [KPI hero row] — unchanged
 └─ Tabs
     ├─ By Client           (existing — profitability)
     ├─ By Ad Account       (existing — profitability)
     ├─ Active Clients      (NEW)
     └─ Active Ad Accounts  (NEW)
```

## Active Clients tab — columns

| Column | Source |
|---|---|
| Client name + platform badges | profiles + campaigns.platform |
| Active campaigns (count) | campaigns filtered by active + 7d spend |
| Spend Today / 7d / 30d (USD) | daily_metrics rollup, 3 chips per row |
| Wallet balance (USD) | `computeWalletBalance(client_id)` |
| Runway (days) | `wallet_usd ÷ avg_daily_spend_last_7d` — colored: red <3d, amber <7d, green ≥7d |
| Profit (BDT) & margin % | reuses existing profitability math for selected date range |
| Row action | link → `/admin/clients/:id` |

## Active Ad Accounts tab — columns

| Column | Source |
|---|---|
| Account name + platform badge | ad_accounts |
| Client | via campaigns.client_id → profiles |
| Active campaigns | count |
| Spend Today / 7d / 30d (USD) | daily_metrics rollup |
| Account balance (if tracked) | ad_accounts.balance if present, else — |
| Profit (BDT) & margin % | existing math |
| Row action | link → `/admin/ad-accounts/:id` |

Header controls (both tabs): search, platform filter, date range (drives the profit column window; spend chips are always fixed to today/7d/30d), refresh, CSV export button.

## KPI hero additions

Add two small KPIs to the existing hero row so the header reflects live posture:
- **Active clients (now)** — count from the new definition
- **Active ad accounts (now)** — count

## Technical details

### 1. New RPC `get_active_entities_overview(p_org_id uuid)`

Single RPC returns both lists in one round-trip. Security-definer, org-scoped via `get_user_org_id`.

Logic outline:
```sql
-- base set: campaigns that are active AND have spend in last 7d
WITH active_camp AS (
  SELECT c.id, c.client_id, c.ad_account_id, c.platform
  FROM campaigns c
  WHERE c.org_id = p_org_id
    AND (lower(c.status) = 'active'
         OR lower(c.status) LIKE 'active -%'
         OR lower(c.status) = 'enable')
    AND EXISTS (
      SELECT 1 FROM daily_metrics dm
      WHERE dm.campaign_id = c.id
        AND dm.data_date >= (current_date - interval '7 days')
        AND dm.spend > 0
    )
),
spend_windows AS (
  SELECT campaign_id,
         SUM(CASE WHEN data_date = current_date THEN spend END) AS s_today,
         SUM(CASE WHEN data_date >= current_date - 6 THEN spend END) AS s_7d,
         SUM(CASE WHEN data_date >= current_date - 29 THEN spend END) AS s_30d
  FROM daily_metrics
  WHERE campaign_id IN (SELECT id FROM active_camp)
    AND data_date >= current_date - 29
  GROUP BY campaign_id
)
-- aggregate by client_id and by ad_account_id, join wallet balance,
-- compute runway = wallet_usd / NULLIF(s_7d/7, 0),
-- reuse existing profit calc (revenue_bdt - cogs_bdt) for selected date range.
```

Wallet balance derived from same view/helper used by `computeWalletBalance` (sum of transactions per client) so a client's runway matches the wallet page exactly.

### 2. New hook `useActiveEntitiesOverview()`
Mirrors `useActiveProfitability`: react-query, `enabled: authReady && !!session && !!orgId`, realtime invalidation on `campaigns` + `daily_metrics` (debounced 1.5s).

### 3. UI components (new, minimal)
- `src/components/profitability/ActiveClientsTable.tsx`
- `src/components/profitability/ActiveAdAccountsTable.tsx`
- Small `RunwayBadge` helper (red/amber/green + tooltip explaining formula).
- Spend chips use existing formatters (`usd()`, `bdt()`).

### 4. Wire-up in `ActiveProfitability.tsx`
- Add two `TabsTrigger` + `TabsContent` blocks after the existing tabs.
- Share the existing search/platform-filter state; add a "Sort by: Spend 7d ↓ / Runway ↑ / Profit ↓" select.
- Add two KPI cards to the hero.

### 5. Realtime & performance
- Single RPC keeps this to one query per tab switch.
- Realtime channel already exists on the page for `daily_metrics` / `campaigns` — extend key list to invalidate the new query.
- Add btree index if missing: `CREATE INDEX IF NOT EXISTS idx_daily_metrics_campaign_date_spend ON daily_metrics(campaign_id, data_date) WHERE spend > 0;`

## Out of scope
- No changes to sync, campaign status logic, or wallet math.
- No new writes — read-only overview.
- No mobile-specific redesign beyond the existing responsive table pattern.
