

## Make KPI Cards 2x2 Grid on Mobile

### Problem
The 4 KPI cards (Today Spend, Collection, Payment Due, Total Balance) currently stack in a single column on screens below 480px (`xs` breakpoint). At 390px (typical mobile), users see 4 stacked cards taking too much vertical space.

### Fix
**File: `src/pages/AdminDashboard.tsx` — Line 279**

Change the grid class from:
```
grid-cols-1 xs:grid-cols-2 lg:grid-cols-4
```
To:
```
grid-cols-2 lg:grid-cols-4
```

This makes the KPIs always display as a 2×2 grid on mobile (2 on top, 2 on bottom), expanding to 4 columns on large screens. One line change.

