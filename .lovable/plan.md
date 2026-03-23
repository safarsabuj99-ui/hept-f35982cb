

## Plan: Upgrade Platform Owner SaaS Management UI/UX to Match Admin Premium Design

### Current Gap

The **Admin dashboard** uses a premium "Bold & Dynamic" design system with glassmorphic sidebar, gradient logo orb, animated icon bubbles, frosted glass nav pills, count-up KPI animations, sparkline charts, perspective tilt cards, section labels, and page-enter transitions.

The **Platform dashboard** uses plain `<Card>` components, a basic sidebar with no premium styling, no animations, no glassmorphic effects, and a flat header. The quality gap is significant.

### Changes

#### 1. Platform Sidebar — Premium Redesign (`PlatformLayout.tsx`)
- Apply `sidebar-premium` class and match AdminLayout structure exactly
- Add gradient `sidebar-logo-orb` with Crown icon (replacing plain box)
- Add `sidebar-header-premium` header with animated brand text + version tag
- Replace plain nav links with the same icon-bubble + glassmorphic active pill pattern (`sidebar-nav-active`, `sidebar-icon-bubble`)
- Add `sidebar-section-divider` between Navigation and Intelligence groups
- Add `sidebar-footer-premium` with ThemeToggle + SignOut icon layout
- Remove the basic "Platform Management" top header bar — replace with AdminLayout-style sticky header with `SidebarTrigger` + mobile logo

#### 2. Platform Dashboard — Premium Redesign (`PlatformDashboard.tsx`)
- Add `DashboardHeader`-style greeting section with time-of-day greeting, date, and animated stat pills (agencies count, MRR, overdue count)
- Replace plain KPI cards with the existing `KpiCard` component (glassmorphic, count-up animation, sparkline support, perspective tilt)
- Add section labels (`<p className="section-label">`) between dashboard zones
- Add `animate-slide-up-fade` and stagger animations on card groups
- Wrap charts in `glass-card glow-border` styled cards
- Add `page-enter` animation wrapper
- Add `PullToRefresh` wrapper for mobile

#### 3. Sub-pages Polish (6 Intelligence + 4 Core pages)
- Wrap each page's card grids in `animate-slide-up-fade` with stagger delays
- Replace plain `<Card>` usage with `glass-card glow-border` where appropriate
- Use `KpiCard` for all KPI displays (Revenue, Lifecycle, Usage, Billing pages)
- Add `section-label` typography for zone separation
- Add `page-enter` wrapper to each page

### Files Changed

| File | Change |
|------|--------|
| `src/components/PlatformLayout.tsx` | Full sidebar + header redesign to match AdminLayout premium pattern |
| `src/pages/PlatformDashboard.tsx` | Greeting header, KpiCard usage, glass-card charts, animations, PullToRefresh |
| `src/pages/TenantLifecycle.tsx` | Glass-card Kanban columns, KpiCard stats, animations |
| `src/pages/PlatformRevenue.tsx` | KpiCard row, glass-card charts, section labels |
| `src/pages/TenantUsageMetering.tsx` | KpiCard alerts, glass-card table, animations |
| `src/pages/PlatformBilling.tsx` | KpiCard aging buckets, glass-card sections |
| `src/pages/PlatformCohorts.tsx` | Glass-card heatmap, animations |
| `src/pages/PlatformChurnPrediction.tsx` | KpiCard risk summary, glass-card table |
| `src/pages/PlatformFeatureAdoption.tsx` | Glass-card heatmap, animations |
| `src/pages/PlatformForecasting.tsx` | KpiCard projections, glass-card charts |
| `src/pages/PlatformCostAnalytics.tsx` | KpiCard unit economics, glass-card forms |
| `src/pages/PlatformHealthScores.tsx` | KpiCard averages, glass-card table |
| `src/pages/PlatformBenchmarks.tsx` | Glass-card comparison panels, animations |

No database or backend changes needed — this is a pure UI/UX upgrade.

