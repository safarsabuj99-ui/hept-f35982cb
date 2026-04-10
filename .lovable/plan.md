

## Premium UI/UX Redesign — All SaaS Management Pages

### Current State
16 platform pages exist with inconsistent styling. Some use `glass-card glow-border`, others use plain `Card`. Headers are inconsistent — some use raw `h1` tags, others have custom layouts. Loading states vary. The design system (`PageHeader`, `glass-card`, `glow-border`, `section-label`, `animate-slide-up-fade`, `KpiCard`) exists but is applied unevenly.

### Design Principles
1. **Consistency** — Every page uses `PageHeader` with icon, `section-label` dividers, `glass-card glow-border` containers, staggered animations
2. **Glassmorphism everywhere** — All cards/tables wrapped in `glass-card glow-border` with `Card border-0 bg-transparent shadow-none` inside
3. **Premium loading** — Skeleton shimmer grids instead of lone spinners
4. **Micro-interactions** — Staggered `animate-slide-up-fade` with incrementing delays, `press-effect` on action buttons

### Shared Page Structure
```text
┌──────────────────────────────────────┐
│ PageHeader (icon + title + actions)  │
├──────────────────────────────────────┤
│ section-label: "Key Metrics"         │
│ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐    │
│ │ KPI │ │ KPI │ │ KPI │ │ KPI │    │
│ └─────┘ └─────┘ └─────┘ └─────┘    │
├──────────────────────────────────────┤
│ section-label: "Details"             │
│ ┌────────────────────────────────┐   │
│ │ glass-card glow-border         │   │
│ │   Card border-0 bg-transparent │   │
│ └────────────────────────────────┘   │
└──────────────────────────────────────┘
```

### Pages to Redesign (14 pages — Dashboard and Plans already done)

**Batch 1 — Core Pages**

1. **AgencyList** — Replace plain table with glass-card agency cards (name, plan badge, status dot, mini usage bars, renewal date). Add search + status filter pills. Table as alternate view toggle.

2. **PlatformBilling** — Add `PageHeader` with icon. Wrap aging buckets in `glass-card`. Row hover glow on invoice table. Status dot indicators.

3. **PlatformRevenue** — Add `PageHeader`. Gradient area fills on charts. Animated KPI counters.

4. **TenantLifecycle** — Add `PageHeader`. Pipeline columns with colored top borders and gradient backgrounds per status.

5. **TenantUsageMetering** — Add `PageHeader`. Gradient progress bars. Better table styling.

**Batch 2 — Intelligence Pages**

6. **PlatformCohorts** — Add `PageHeader`. Better heatmap cells with rounded corners and hover tooltips.

7. **PlatformChurnPrediction** — Add `PageHeader`. Risk cards with colored left-accent borders. Risk gauge visuals.

8. **PlatformFeatureAdoption** — Add `PageHeader`. Enhanced heatmap color scales and hover states.

9. **PlatformForecasting** — Add `PageHeader`. Gradient area fill on forecast chart with styled confidence bands.

10. **PlatformCostAnalytics** — Add `PageHeader`. Gradient bar fills on cost breakdown.

11. **PlatformHealthScores** — Add `PageHeader`. Circular score gauges with color-coded health tiers.

12. **PlatformBenchmarks** — Add `PageHeader`. Dual-tone comparison bars.

**Batch 3 — System Pages**

13. **PlatformAnnouncements** — Add `PageHeader`. Type-colored left borders on cards (info=blue, warning=amber, critical=red).

14. **PlatformAudit** — Add `PageHeader`. Severity-colored row indicators with timeline dots.

### Layout Enhancement
- **PlatformLayout** — Add `NotificationBell` to header (currently missing). Add user avatar in footer.

### Files Changed (16 files, no database changes)
- `src/components/PlatformLayout.tsx` — add NotificationBell, user info
- `src/pages/AgencyList.tsx` — full premium redesign with card/table toggle
- `src/pages/PlatformBilling.tsx` — premium wrapper upgrade
- `src/pages/PlatformRevenue.tsx` — premium wrapper upgrade
- `src/pages/TenantLifecycle.tsx` — premium styling upgrade
- `src/pages/TenantUsageMetering.tsx` — premium wrapper upgrade
- `src/pages/PlatformCohorts.tsx` — premium wrapper upgrade
- `src/pages/PlatformChurnPrediction.tsx` — premium wrapper upgrade
- `src/pages/PlatformFeatureAdoption.tsx` — premium wrapper upgrade
- `src/pages/PlatformForecasting.tsx` — premium wrapper upgrade
- `src/pages/PlatformCostAnalytics.tsx` — premium wrapper upgrade
- `src/pages/PlatformHealthScores.tsx` — premium wrapper upgrade
- `src/pages/PlatformBenchmarks.tsx` — premium wrapper upgrade
- `src/pages/PlatformAnnouncements.tsx` — premium wrapper upgrade
- `src/pages/PlatformAudit.tsx` — premium wrapper upgrade
- `src/pages/CreateAgency.tsx` — premium form styling

