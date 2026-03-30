

## Plan: Compact Mobile Profitability View + Remove Client Overview

### Changes

**1. Remove Client Overview Table** — `src/pages/AdminDashboard.tsx`
- Remove the "Client Data" section (lines 348-352) with `<ClientOverviewTable>`
- Remove the `ClientOverviewTable` import

**2. Compact Mobile Profitability Cards** — `src/components/dashboard/ProfitabilityTable.tsx`

Replace the current mobile card layout (lines 225-286) which uses large cards with a 2x2 grid inside each. New layout will be a **single-row per client** — a tight list where each row shows:

```text
┌─────────────────────────────────────┐
│ ▶ ClientName   $450  ৳12K  +18.5%  │
├─────────────────────────────────────┤
│ ▶ ClientName2  $220  ৳6K   +15.2%  │
└─────────────────────────────────────┘
```

- Each row: chevron + name on left, spend + profit + margin badge on right — all on one line
- Tapping expands to show platform breakdown (kept as-is but tighter)
- Remove the Revenue/Cost fields from the collapsed view (only show Spend, Profit, Margin)
- Reduced padding (`p-2.5` instead of `p-4`), smaller text (`text-xs`)
- Desktop table stays unchanged

