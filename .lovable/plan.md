

## Speed Up Data Loading — Performance Optimization Plan

### Root Cause Analysis

The admin dashboard is slow because of **three compounding issues**:

1. **Waterfall queries**: The main dashboard hook fetches data in 3 sequential rounds (mapped accounts → campaigns → then 9 parallel queries → then 2 more sequential queries). That's 4 network round-trips minimum before any data appears.

2. **Duplicate fetching**: The dashboard page loads `AdminDashboard` which fires `useAdminDashboardData`, but the same page also renders `ProfitabilityTable` and `ProfitLossWidget` — each of which independently fetches the **same tables** (profiles, user_roles, campaigns, daily_metrics, usd_purchases, ad_account_clients) with their own waterfall chains. That's **3x the queries** for overlapping data.

3. **Unbounded SELECT * queries**: `transactions` table is fetched with `select("*")` and no filters — pulling every column of every row. Same for `daily_metrics` in `ClientList` (no date filter). As data grows, these become progressively slower.

### The Fix — 3 Layers

---

**Layer 1: Create a server-side aggregation function (database)**

Move the heavy computation to PostgreSQL where it belongs. One RPC call replaces 12+ client-side queries.

- Create a database function `get_admin_dashboard_summary(p_date_from date, p_date_to date)` that returns a single JSON object with: total spend, yesterday spend, collections, client balances, spend history (7-day), collection history (7-day), pending count, active accounts, last synced.
- This eliminates all waterfall queries — one round-trip, computed server-side with indexed access.

**Layer 2: Shared data context for dashboard widgets**

- Refactor `useAdminDashboardData` to also compute and expose profitability and P&L data (WAC, per-client spend, revenue vs COGS).
- `ProfitabilityTable` and `ProfitLossWidget` consume this shared data via props or a shared query key instead of fetching independently.
- This eliminates ~20 duplicate queries per page load.

**Layer 3: Query hygiene across all pages**

- Replace `select("*")` with specific columns everywhere (transactions, daily_metrics, etc.).
- Add `.limit()` or date-range filters to unbounded queries (e.g., `ClientList` fetches ALL daily_metrics with no date filter).
- Move `ClientList` to use React Query instead of raw `useEffect` + `useState` for caching benefits.

---

### Files Modified

| File | Change |
|---|---|
| **New migration** | Create `get_admin_dashboard_summary` RPC function |
| `src/hooks/useAdminDashboardData.ts` | Replace 12+ queries with single RPC call; add shared profitability data |
| `src/pages/AdminDashboard.tsx` | Pass shared data to child widgets |
| `src/components/dashboard/ProfitabilityTable.tsx` | Accept data via props instead of independent fetch |
| `src/components/ProfitLossWidget.tsx` | Accept data via props instead of independent fetch |
| `src/pages/ClientList.tsx` | Migrate to React Query; select specific columns; add date limit to metrics |
| `src/pages/ClientDashboard.tsx` | Replace `select("*")` with specific columns |
| `src/pages/ClientDetail.tsx` | Replace `select("*")` with specific columns |
| `src/pages/ManagerDashboard.tsx` | Replace `select("*")` with specific columns |

### Expected Impact
- Admin dashboard: **~4 seconds → under 1 second** (single RPC vs 12+ sequential queries)
- Client List: **~50% faster** (bounded queries + caching)
- All pages benefit from column-specific selects reducing payload size

