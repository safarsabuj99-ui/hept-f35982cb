

## Plan: Platform Owner SaaS Management — 4 Core Features

This is a large implementation covering 4 interconnected features. I will build them incrementally across new pages and enhance existing ones.

---

### Feature 1: Tenant Lifecycle Manager

**What it does:** Visual Kanban-style pipeline showing agencies flowing through Trial → Active → Suspended → Cancelled, with automated grace period handling.

**Changes:**
- **New page: `src/pages/TenantLifecycle.tsx`** — Kanban board with 4 columns, drag-to-change-status, grace period countdown for trial agencies, bulk actions (activate/suspend multiple)
- **New route** in `App.tsx`: `/platform/lifecycle`
- **New nav item** in `PlatformLayout.tsx`
- **Database migration**: Add `grace_period_days` (integer, default 7) and `status_changed_at` (timestamptz) columns to `organizations` table for tracking state transition timing
- **Edge function: `tenant-lifecycle-check`** — Scheduled function that auto-transitions expired trials to suspended (respecting grace period)

**UI:** 4 swimlane columns with agency cards showing name, plan, days-in-state, usage summary. Click card → navigate to AgencyDetail. Drag card between columns to change status (with confirmation dialog for suspend/cancel).

---

### Feature 2: MRR/ARR Revenue Dashboard

**What it does:** Dedicated revenue analytics page with real-time MRR, ARR, growth rate, churn rate, expansion/contraction revenue, and trend charts.

**Changes:**
- **New page: `src/pages/PlatformRevenue.tsx`** — Full revenue dashboard with:
  - KPI row: MRR, ARR, MRR Growth %, Churn Rate, ARPA, Net Revenue Retention
  - MRR trend line chart (last 12 months, computed from subscription history)
  - Revenue breakdown by plan tier (stacked bar chart)
  - Expansion vs contraction waterfall (upgrades minus downgrades)
  - Churned revenue table (recently cancelled/suspended agencies)
- **New route**: `/platform/revenue`
- **New nav item** in `PlatformLayout.tsx`
- **Database migration**: Create `mrr_snapshots` table to store monthly MRR snapshots for historical trending:
  ```
  mrr_snapshots: id, snapshot_month (date), total_mrr, new_mrr, churned_mrr, 
  expansion_mrr, contraction_mrr, active_count, created_at
  ```
  RLS: platform_owner only.
- **Edge function: `snapshot-mrr`** — Monthly scheduled function that calculates and stores MRR breakdown from `organization_subscriptions`

All calculations derive from existing `organization_subscriptions` + `organizations` tables. The snapshot function ensures historical data persists even as subscriptions change.

---

### Feature 3: Tenant Usage Metering

**What it does:** Real-time dashboard showing each agency's resource consumption vs plan limits with overage alerts and usage trend tracking.

**Changes:**
- **New page: `src/pages/TenantUsageMetering.tsx`** — Table of all agencies with:
  - Progress bars for clients/ad-accounts/managers usage vs limits
  - Color coding: green (<70%), yellow (70-90%), red (>90%)
  - Overage alerts panel at top (agencies exceeding any limit)
  - Click row → AgencyDetail
  - Filter by: plan, status, "over limit only"
- **New route**: `/platform/usage`
- **New nav item** in `PlatformLayout.tsx`

This feature queries existing data (profiles, ad_accounts by org_id against organization limits) — no new tables needed. The AgencyDetail page already has usage meters; this page aggregates them across all agencies.

---

### Feature 4: Payment Collection Tracker

**What it does:** Enhanced billing view with aging invoice analysis, payment timeline, and collection status per agency.

**Changes:**
- **Enhance `PlatformBilling.tsx`** with:
  - Aging buckets summary cards: Current, 30-day, 60-day, 90-day+ overdue
  - Payment timeline (last 6 months collected vs billed chart)
  - Agency payment health table: agency name, total billed, total paid, outstanding, days since last payment, status badge
  - Quick filter: "Overdue only", "Never paid", "Paid this month"
- **Database migration**: Add `due_date` column (date, nullable) to `platform_invoices` for proper aging calculation
- Aging is computed client-side: `today - due_date` bucketed into 30/60/90 day ranges

---

### Navigation Update

Add 3 new items to `PlatformLayout.tsx` nav:
```
Lifecycle    → /platform/lifecycle    (GitBranch icon)
Revenue      → /platform/revenue     (TrendingUp icon)  
Usage        → /platform/usage       (BarChart3 icon)
```

### Database Migrations Summary

1. `organizations`: add `grace_period_days` (int default 7), `status_changed_at` (timestamptz default now())
2. New table `mrr_snapshots` with platform_owner RLS
3. `platform_invoices`: add `due_date` (date, nullable)

### New Files

| File | Purpose |
|------|---------|
| `src/pages/TenantLifecycle.tsx` | Kanban lifecycle board |
| `src/pages/PlatformRevenue.tsx` | MRR/ARR analytics dashboard |
| `src/pages/TenantUsageMetering.tsx` | Cross-agency usage monitoring |
| `supabase/functions/tenant-lifecycle-check/index.ts` | Auto-expire trials |
| `supabase/functions/snapshot-mrr/index.ts` | Monthly MRR snapshot |

### Modified Files

| File | Change |
|------|--------|
| `src/App.tsx` | Add 3 new platform routes |
| `src/components/PlatformLayout.tsx` | Add 3 nav items |
| `src/pages/PlatformBilling.tsx` | Add aging buckets, payment timeline, collection health |

