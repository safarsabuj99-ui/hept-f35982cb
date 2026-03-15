

## Plan: Tier 2 — Intelligence & Analytics (7 Features)

Seven new platform owner pages providing analytics, AI-driven insights, and benchmarking across all tenants.

---

### Feature 9: Cohort Analysis Dashboard
**New file:** `src/pages/PlatformCohorts.tsx`
- Group agencies by signup month (from `organizations.created_at`)
- Table: cohort month rows × columns for Month 1, 2, 3... showing retention % (still active vs total signed up)
- Revenue per cohort row from `organization_subscriptions`
- Color-coded retention heatmap (green = high retention, red = low)
- No new tables needed — computed from `organizations` + `organization_subscriptions`

### Feature 10: Churn Prediction Engine
**New file:** `src/pages/PlatformChurnPrediction.tsx`
**New edge function:** `supabase/functions/churn-predict/index.ts`
- Edge function calls Lovable AI (gemini-3-flash-preview) with per-agency metrics: days since last login (from `audit_logs`), payment delays (from `platform_invoices`), usage vs limits, subscription age
- Returns risk score (0-100) + reasoning per agency
- UI: sortable table with risk score badge (High/Medium/Low), risk factors column, trend indicator
- "Analyze All" button triggers batch analysis

### Feature 11: Feature Adoption Heatmap
**New file:** `src/pages/PlatformFeatureAdoption.tsx`
**DB migration:** New `feature_usage_events` table:
```
id, org_id, feature_key (text), event_count (int), last_used_at (timestamptz), period (date)
```
RLS: platform_owner only.
- Heatmap grid: rows = agencies, columns = features (clients, ad_accounts, campaigns, finance, integrations, reports)
- Color intensity based on usage frequency
- Summary row showing adoption % per feature across all agencies
- Initially seeded from existing data counts (profiles, ad_accounts, etc. per org)

### Feature 12: Revenue Forecasting
**New file:** `src/pages/PlatformForecasting.tsx`
**New edge function:** `supabase/functions/revenue-forecast/index.ts`
- Edge function calls Lovable AI with historical MRR snapshots + current subscription data
- Returns projected MRR for next 3/6/12 months with confidence intervals
- UI: Line chart showing historical MRR (solid line) + forecast (dashed line) with confidence band
- KPI cards: Projected MRR at 3/6/12 months, projected churn impact

### Feature 13: Platform Cost Analytics
**New file:** `src/pages/PlatformCostAnalytics.tsx`
**DB migration:** New `platform_costs` table:
```
id, period (date), category (text: 'edge_functions'|'storage'|'bandwidth'|'other'),
amount_bdt (numeric), org_id (uuid nullable — null = platform-wide), notes (text), created_at
```
RLS: platform_owner only.
- Manual cost entry form (platform owner inputs monthly infra costs)
- Unit economics dashboard: cost per tenant, cost per active user, gross margin %
- Revenue vs cost comparison chart
- Per-tenant cost breakdown table

### Feature 14: Customer Health Score
**New file:** `src/pages/PlatformHealthScores.tsx`
**DB migration:** New `tenant_health_scores` table:
```
id, org_id (uuid), score (integer 0-100), activity_score (integer),
payment_score (integer), usage_score (integer), computed_at (timestamptz default now())
```
RLS: platform_owner only.
- Composite score calculated client-side from:
  - **Activity** (25%): days since last audit_log entry per org
  - **Payment** (35%): invoice payment timeliness from `platform_invoices`
  - **Usage** (40%): resource utilization % from org limits vs actual counts
- Sortable table with score badge, breakdown sparkline, trend arrow
- "Recalculate All" button stores snapshots for trending

### Feature 15: Benchmark Reports
**New file:** `src/pages/PlatformBenchmarks.tsx`
- Anonymous cross-agency comparison using existing data
- Metrics: clients managed, ad accounts, total ad spend, campaigns active, payment regularity
- Percentile distribution charts (bar chart showing distribution)
- "Average agency" vs "Top 10%" comparison cards
- No new tables — computed from `organizations`, `profiles`, `ad_accounts`, `organization_subscriptions`

---

### Navigation Update
Add 7 new nav items to `PlatformLayout.tsx` under a new "Intelligence" group:
```
Cohorts       → /platform/cohorts       (Users icon)
Churn Risk    → /platform/churn         (AlertTriangle icon)
Adoption      → /platform/adoption      (Grid3X3 icon)
Forecasting   → /platform/forecasting   (LineChart icon)
Costs         → /platform/costs         (Calculator icon)
Health Scores → /platform/health-scores (HeartPulse icon)
Benchmarks    → /platform/benchmarks    (Trophy icon)
```

### Routing Update
Add 7 routes in `App.tsx` under the platform owner section.

### Database Migrations Summary
1. New table `feature_usage_events` (Feature 11)
2. New table `platform_costs` (Feature 13)
3. New table `tenant_health_scores` (Feature 14)
All with platform_owner-only RLS.

### Edge Functions
1. `supabase/functions/churn-predict/index.ts` — AI-powered churn risk scoring
2. `supabase/functions/revenue-forecast/index.ts` — AI-powered revenue projection

### Files Summary

| New Files | Purpose |
|-----------|---------|
| `src/pages/PlatformCohorts.tsx` | Cohort retention heatmap |
| `src/pages/PlatformChurnPrediction.tsx` | AI churn risk table |
| `src/pages/PlatformFeatureAdoption.tsx` | Feature usage heatmap |
| `src/pages/PlatformForecasting.tsx` | Revenue forecast charts |
| `src/pages/PlatformCostAnalytics.tsx` | Unit economics dashboard |
| `src/pages/PlatformHealthScores.tsx` | Customer health scoring |
| `src/pages/PlatformBenchmarks.tsx` | Cross-agency benchmarks |
| `supabase/functions/churn-predict/index.ts` | AI churn analysis |
| `supabase/functions/revenue-forecast/index.ts` | AI revenue projection |

| Modified Files | Change |
|----------------|--------|
| `src/App.tsx` | Add 7 platform routes |
| `src/components/PlatformLayout.tsx` | Add Intelligence nav group with 7 items |

