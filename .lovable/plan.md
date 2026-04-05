

## Performance Optimization Plan — Fast-Load Data System

### Current Problems
1. **All 40+ pages eagerly imported** — the entire app bundles into one massive JS file, slowing initial load
2. **Admin Dashboard uses raw `useEffect`/`useState`** — no caching; every navigation re-fetches everything from scratch
3. **Dashboard makes 10+ sequential Supabase queries** on every mount — waterfall pattern
4. **No prefetching** — navigating to any page starts fetching from zero
5. **Child widgets (ProfitabilityTable, SpendTrendChart, etc.) likely duplicate queries** already fetched by the parent

### Solution: 4-Layer Performance Stack

```text
Layer 1: Code Splitting (faster initial load)
Layer 2: React Query Migration (instant cache hits)
Layer 3: Database Indexes (faster query execution)
Layer 4: Prefetch on Hover (perceived zero latency)
```

---

### Layer 1 — Route-Level Code Splitting

Convert all 40+ page imports in `App.tsx` from eager to lazy:

```text
// Before: import AdminDashboard from "@/pages/AdminDashboard"
// After:  const AdminDashboard = lazy(() => import("@/pages/AdminDashboard"))
```

Wrap routes in `<Suspense>` with a lightweight spinner. This alone can cut initial bundle by 60-70%.

**File**: `App.tsx`

---

### Layer 2 — React Query Migration for Admin Dashboard

Replace the raw `useEffect` + `fetchData()` pattern in `AdminDashboard.tsx` with dedicated `useQuery` hooks. This gives:
- **Instant cache** — navigating away and back shows data immediately
- **Background revalidation** — stale data updates silently
- **No duplicate fetches** — React Query deduplicates concurrent requests

Create a new hook `useAdminDashboardData(dateRange)` that returns all KPI data using `useQuery` with appropriate query keys. Each widget query gets its own cache key so changing date range only invalidates what's needed.

Realtime subscriptions will call `queryClient.invalidateQueries()` instead of re-running the entire fetch.

**Files**: New `src/hooks/useAdminDashboardData.ts`, update `AdminDashboard.tsx`

---

### Layer 3 — Database Indexes

Add indexes on the most-queried columns to speed up server-side execution:

```sql
CREATE INDEX IF NOT EXISTS idx_daily_metrics_date ON daily_metrics(data_date);
CREATE INDEX IF NOT EXISTS idx_daily_metrics_campaign ON daily_metrics(campaign_id);
CREATE INDEX IF NOT EXISTS idx_transactions_client ON transactions(client_id, status);
CREATE INDEX IF NOT EXISTS idx_transactions_type_status ON transactions(type, status);
CREATE INDEX IF NOT EXISTS idx_campaigns_client ON campaigns(client_id, status);
CREATE INDEX IF NOT EXISTS idx_payment_requests_status ON payment_requests(status, created_at);
CREATE INDEX IF NOT EXISTS idx_ad_account_clients_account ON ad_account_clients(ad_account_id);
```

**File**: Database migration

---

### Layer 4 — Prefetch on Hover

Add a `usePrefetch` utility that triggers `queryClient.prefetchQuery()` when the user hovers over navigation links. When they click, data is already cached.

Integrate with `AdminLayout` sidebar links so hovering "Clients" prefetches client list data, hovering "Finance" prefetches finance data, etc.

**Files**: New `src/hooks/usePrefetch.ts`, update `AdminLayout.tsx` NavLink components

---

### Implementation Order

| Step | What | Impact |
|------|------|--------|
| 1 | Code splitting in `App.tsx` | 60-70% smaller initial bundle |
| 2 | Database indexes (migration) | 2-5x faster query response |
| 3 | React Query migration for dashboard | Instant navigation, no re-fetch |
| 4 | Prefetch on hover | Zero perceived latency |

### Files Changed (~5 files)

| File | Change |
|------|--------|
| `App.tsx` | Lazy imports + Suspense wrapper for all routes |
| Migration SQL | Add 7 performance indexes |
| `src/hooks/useAdminDashboardData.ts` | New hook: React Query-based dashboard data |
| `AdminDashboard.tsx` | Replace useEffect/useState with new hook |
| `src/hooks/usePrefetch.ts` | New: prefetch utility for sidebar hover |
| `AdminLayout.tsx` | Wire prefetch to nav links |

