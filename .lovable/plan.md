

# Real-Time Data Architecture with Tiered Sync Engine

## Overview
Implement a high-performance data pipeline using background sync jobs, real-time database subscriptions, and a manual sync button -- so dashboards load instantly from the database while background jobs keep data fresh.

## Architecture

The system follows a "Stale-While-Revalidate" pattern:
- Dashboards always read from the database (instant load)
- Two background cron jobs keep data fresh at different intervals
- Supabase Realtime pushes updates to the UI automatically
- A "Sync Now" button lets admins trigger on-demand refreshes with rate limiting

```text
+------------------+       +-------------------+       +-----------+
|  pg_cron (15m)   |------>| sync-fast-lane    |------>| DB Tables |
|  pg_cron (60m)   |------>| sync-deep-dive    |       |           |
+------------------+       +-------------------+       +-----+-----+
                                                             |
                                                     Realtime Channel
                                                             |
                                                       +-----v-----+
                           "Sync Now" Button --------->|  React UI  |
                           (calls sync-fast-lane)      +-----------+
```

## Database Changes

### New Table: `campaign_performance`
Stores heavy analytics metrics fetched by the deep-dive sync.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| campaign_id | text | From platform |
| campaign_name | text | |
| ad_account_id | uuid | FK |
| client_id | uuid | Nullable |
| date | date | |
| impressions | bigint | Default 0 |
| clicks | bigint | Default 0 |
| ctr | numeric | Default 0 |
| cpc | numeric | Default 0 |
| roas | numeric | Default 0 |
| spend | numeric | Default 0 |
| synced_at | timestamptz | Default now() |

RLS: Admin full access, client read own (via ad_account_clients), manager read managed.

### New Indexes (Performance Tuning)
- `idx_campaign_mappings_client_id` on `campaign_mappings(client_id)`
- `idx_daily_ad_spend_client_date` on `daily_ad_spend(ad_account_id, date)`
- `idx_campaign_performance_campaign_date` on `campaign_performance(campaign_id, date)`
- `idx_transactions_client_status` on `transactions(client_id, status)`

### Enable Realtime
- `ALTER PUBLICATION supabase_realtime ADD TABLE daily_ad_spend;`
- `ALTER PUBLICATION supabase_realtime ADD TABLE transactions;`
- `ALTER PUBLICATION supabase_realtime ADD TABLE campaign_performance;`

## Edge Functions

### A. `sync-fast-lane` (Every 15 minutes)
- **Purpose:** Lightweight sync of critical financial data only
- **Scope:** For each active ad account, mock-generate `current_spend` updates into `daily_ad_spend` and update account balances
- **Mock mode:** Generates realistic random spend increments (since real APIs aren't connected yet for all platforms)
- **Accepts optional `client_id` param** for manual sync of a single client
- **Updates `api_integrations.last_synced_at`** on completion
- Config: `verify_jwt = false` (validates auth in code; also allows unauthenticated cron calls with a secret check)

### B. `sync-deep-dive` (Every 60 minutes)
- **Purpose:** Heavy analytics fetch
- **Scope:** For each active campaign, mock-generate `impressions`, `clicks`, `ctr`, `cpc`, `roas` into `campaign_performance`
- **Batching:** Processes 5 accounts per batch with small delays
- **Mock mode:** Generates realistic analytics data
- Config: `verify_jwt = false`

### C. Cron Scheduling (via pg_cron + pg_net)
Two scheduled jobs calling the edge functions:
- `sync-fast-lane`: every 15 minutes (`*/15 * * * *`)
- `sync-deep-dive`: every 60 minutes (`0 * * * *`)

## Frontend Changes

### 1. `src/components/dashboard/DashboardHeader.tsx`
Add a "Sync Now" button with:
- RefreshCw icon with spinning animation while syncing
- Rate limiting: checks `last_synced_at` -- if < 5 min ago, shows toast "Data is up to date"
- On click: calls `sync-fast-lane` edge function, shows "Syncing..." toast
- On completion: Realtime listener auto-updates the numbers

### 2. `src/pages/AdminDashboard.tsx`
- Pass `onSyncNow` handler and `isSyncing` state to DashboardHeader
- Realtime subscriptions already exist -- they'll pick up sync-fast-lane DB writes automatically

### 3. `src/pages/ClientDashboard.tsx`
- Add "Sync Now" button in the header area (calls sync-fast-lane with own client_id)
- Realtime subscriptions already exist -- no additional changes needed for live updates
- Add pagination to Transaction History and Payment Requests tables using `useInfiniteQuery` pattern (load 20 rows, "Load More" button)

### 4. React Query Integration
- Configure `QueryClient` with `staleTime: 30_000` (30s) so cached data shows instantly
- Dashboard data queries use `initialData` from cache for zero-spinner loads

## File Summary

| Action | File |
|--------|------|
| **Create** | `supabase/functions/sync-fast-lane/index.ts` |
| **Create** | `supabase/functions/sync-deep-dive/index.ts` |
| **Modify** | `supabase/config.toml` (add verify_jwt for new functions) |
| **Modify** | `src/components/dashboard/DashboardHeader.tsx` (Sync Now button) |
| **Modify** | `src/pages/AdminDashboard.tsx` (sync handler, pass to header) |
| **Modify** | `src/pages/ClientDashboard.tsx` (sync button, infinite scroll tables) |
| **Modify** | `src/App.tsx` (QueryClient staleTime config) |
| **Migration** | New `campaign_performance` table, indexes, realtime publication |
| **SQL (insert tool)** | pg_cron schedule for both functions |

