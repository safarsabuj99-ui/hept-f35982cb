

## SaaS Management System Audit — Essential vs Non-Essential

Your platform owner portal currently has **30 menu items** across 8 sections. Here's the breakdown:

### ESSENTIAL (Can't run SaaS without these) — 8 items

| # | Feature | Why Essential |
|---|---------|---------------|
| 1 | **Dashboard** | See MRR, active agencies, revenue at a glance |
| 2 | **Agencies** | Create, view, manage tenant agencies — core of multi-tenant |
| 3 | **Plans** | Define subscription tiers, limits, feature flags |
| 4 | **Billing** | Verify payments, approve subscriptions |
| 5 | **Lifecycle** | Track agency status (Pending → Active → Suspended) |
| 6 | **Revenue** | Monitor MRR/ARR, understand business health |
| 7 | **Announcements** | Communicate with all agencies |
| 8 | **Audit Logs** | Security and accountability trail |

### REMOVE (Nice-to-have analytics/automation — not needed to operate) — 22 items

| Section | Items to Remove |
|---------|----------------|
| Revenue | Financial Reports, Usage Metering, Payment Gateway, Dunning, Currency Rates |
| Agencies | Referrals |
| Intelligence | Cohorts, Churn Risk, Adoption, Forecasting, Costs, Health Scores, Benchmarks (all 7) |
| Communication | Email Templates, Email Log |
| Support | Support Tickets |
| Compliance | Legal Documents, Data Exports |
| System | System Health |

### Resulting Lean Sidebar

```text
─────────────────
  Dashboard
  Lifecycle
─────────────────
 Revenue
  Revenue
  Billing
  Plans
─────────────────
 Agencies
  Agencies
  Announcements
─────────────────
 System
  Audit Logs
─────────────────
```

### Implementation

**Files changed:**
- `src/components/PlatformLayout.tsx` — Remove 22 nav items, keep 8 essential ones
- `src/App.tsx` — Remove lazy imports and routes for the 22 deleted pages
- Delete 22 page files from `src/pages/` (PlatformCohorts, PlatformChurnPrediction, PlatformFeatureAdoption, PlatformForecasting, PlatformCostAnalytics, PlatformHealthScores, PlatformBenchmarks, PlatformPaymentGateway, PlatformDunning, PlatformEmailTemplates, PlatformEmailLog, PlatformFinancialReports, PlatformCurrencyRates, PlatformReferrals, PlatformSupport, PlatformLegal, PlatformDataExports, PlatformHealth, TenantUsageMetering)

Note: The deleted pages and their database tables/edge functions remain intact — they can be re-added anytime without data loss.

