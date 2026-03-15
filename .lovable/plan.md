

## Plan: Swap BDT/USD Display Priority

### Changes

#### 1. Admin Dashboard — Payment Due KPI (lines 298-305)
Swap so BDT is the main `value` and USD is the `subtitle`:
```tsx
<KpiCard
  title="Payment Due"
  value={`৳${totalDueBdt.toLocaleString(...)}`}
  subtitle={`$${totalDue.toLocaleString(...)}`}
  ...
/>
```

#### 2. Client Dashboard — Balance Display (lines 264-276)
Conditional logic:
- **If balance < 0**: Show BDT as main (large text), USD as sub (small text)
- **If balance >= 0**: Show USD as main, BDT as sub

Need to also compute a `totalPositiveBdt` for the non-negative case (weighted sum of positive platform balances × their rates, or simple `balance × avgRate`). For positive balances, a simple weighted calculation using the same platform breakdown logic will work.

### Files Changed

| File | Change |
|------|--------|
| `src/pages/AdminDashboard.tsx` | Swap value/subtitle in Payment Due KpiCard |
| `src/pages/ClientDashboard.tsx` | Conditional BDT-first/USD-first display based on balance sign; add `totalBdt` calculation for positive balances |

