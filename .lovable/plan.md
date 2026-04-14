

## Plan: Premium Responsive KPI Widget for Cash Flow

### Current State
The 6 KPIs are split into two separate grid sections — 3 summary cards (Total Liquid Funds, Outstanding Withdrawals, Loan Outstanding) and 3 account-type cards (Cash, Bank, MFS). On mobile, they stack vertically into 6 full-width rows, taking excessive vertical space.

### New Design: Unified Premium Widget

Replace both grids with a single unified `glass-card` widget:

```text
┌─────────────────────────────────────────────────────┐
│  DESKTOP (lg+): 2 rows                             │
│  ┌───────────┬──────────────┬──────────────┐        │
│  │ Total     │ Outstanding  │ Loan         │  Row 1 │
│  │ Liquid    │ Withdrawals  │ Outstanding  │        │
│  ├───────────┼──────────────┼──────────────┤        │
│  │ Cash      │ Bank         │ MFS          │  Row 2 │
│  └───────────┴──────────────┴──────────────┘        │
│                                                     │
│  TABLET (sm-lg): 3 cols, 2 rows (same as desktop)   │
│                                                     │
│  MOBILE (<sm): 2 cols compact grid                  │
│  ┌──────────┬──────────────┐                        │
│  │ Total    │ Withdrawals  │                        │
│  │ Liquid   │ Outstanding  │                        │
│  ├──────────┼──────────────┤                        │
│  │ Loan     │ Cash         │                        │
│  ├──────────┼──────────────┤                        │
│  │ Bank     │ MFS          │                        │
│  └──────────┴──────────────┘                        │
└─────────────────────────────────────────────────────┘
```

### Visual Enhancements
- Single glass-card container with accent-colored left border per KPI cell
- Top 3 KPIs (summary) use colored accent bars (primary, warning, destructive)
- Bottom 3 (account types) use subtle muted styling
- Compact font sizing on mobile (`text-lg` vs `text-2xl`)
- Always show all 6 KPIs (remove conditional hiding of withdrawals/loans when zero — zero is useful info)
- Staggered fade-in animation matching the existing `animate-slide-up-fade` pattern

### Files Changed
| Action | File |
|--------|------|
| Modify | `src/pages/CashFlowManagement.tsx` — Replace lines 849-921 with unified premium KPI grid |

