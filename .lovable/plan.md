

## Optimize USD Inventory: Server-Side Precomputation

### Problem

The frontend `fetchOverview` makes 4 heavy queries on every page load:
1. Latest snapshot (fast)
2. All `usd_purchases` since snapshot (moderate)
3. All `daily_metrics.spend` since snapshot (potentially huge — 10M+ rows table)
4. **All `transactions` ever** to compute client obligations (worst offender — no date filter, loads entire ledger)

This causes slow loads, especially as data grows.

### Solution: Move All Computation to the Edge Function

The `auto-snapshot-usd` function already runs every 5 minutes. Extend it to precompute ALL overview metrics and store them as a JSONB column on the snapshot. The frontend then reads a single row — instant load.

### Changes

#### 1. Database Migration
Add a `metrics` JSONB column to `usd_inventory_snapshots`:
```sql
ALTER TABLE usd_inventory_snapshots 
ADD COLUMN metrics jsonb DEFAULT '{}'::jsonb;
```

The `metrics` field will store:
```json
{
  "bought_since": 150,
  "spent_since": 80,
  "daily_burn": 12.5,
  "runway_days": 5,
  "client_obligations": 320,
  "usd_needed": 50
}
```

#### 2. Rewrite `supabase/functions/auto-snapshot-usd/index.ts`
- Keep existing balance calculation (snapshot + purchases - spend)
- Add: 7-day burn rate calculation (daily_metrics last 7 days)
- Add: client obligations calculation (SUM credits - SUM debits per client, filter positive balances)
- Add: USD needed = max(0, obligations - balance)
- Store all in `metrics` JSONB on upsert

#### 3. Simplify `src/pages/WalletInventory.tsx` — `fetchOverview`
Replace 4 queries with a single query:
```typescript
const { data } = await supabase
  .from("usd_inventory_snapshots")
  .select("*")
  .order("snapshot_date", { ascending: false })
  .limit(1);

const snap = data?.[0];
const metrics = snap?.metrics ?? {};
setOverview({
  carryForward: snap?.balance_usd ?? 0,
  availableBalance: snap?.balance_usd ?? 0,
  boughtSince: metrics.bought_since ?? 0,
  spentSince: metrics.spent_since ?? 0,
  dailyBurn: metrics.daily_burn ?? 0,
  runwayDays: metrics.runway_days ?? 0,
  clientObligations: metrics.client_obligations ?? 0,
  usdNeeded: metrics.usd_needed ?? 0,
  snapshotDate: snap?.snapshot_date ?? null,
  loading: false,
});
```

- Add realtime subscription on `usd_inventory_snapshots` so when the cron updates every 5 min, the UI refreshes automatically
- Keep a manual "Refresh Now" button that invokes the edge function on-demand

### Result
- Page load: **1 query** instead of 4 heavy ones
- Data freshness: auto-updated every 5 minutes + manual refresh
- No client-side aggregation of large tables
- Realtime updates when snapshot changes

### Files Changed
- **Migration**: Add `metrics` column to `usd_inventory_snapshots`
- **`supabase/functions/auto-snapshot-usd/index.ts`** — Compute and store all metrics
- **`src/pages/WalletInventory.tsx`** — Single-query overview + realtime subscription

