

## Plan: Upgrade Cash Flow KPIs to Premium KpiCard Components

### Problem
The current Cash Flow KPIs use a flat grid with `divide-x/divide-y` inside a single container. They lack the premium effects the admin dashboard has: gradient accent bars, background glow orbs, 3D perspective tilt, count-up animations, and hover interactions.

### Solution
Replace the inline KPI grid (lines 850-939) with 6 individual `KpiCard` components — the same component used on the admin dashboard — inside a responsive `grid-cols-2 sm:grid-cols-3` layout.

Each KPI maps to a `KpiCard`:

| KPI | Icon | Accent Color |
|-----|------|-------------|
| Total Liquid Funds | Wallet | `hsl(var(--primary))` |
| Outstanding Withdrawals | HandCoins | `hsl(var(--warning))` |
| Loan Outstanding | Landmark | `hsl(var(--destructive))` |
| Cash | Banknote | `hsl(var(--chart-meta))` |
| Bank | Building2 | `hsl(var(--chart-google))` |
| MFS | Smartphone | `hsl(var(--chart-tiktok))` |

Each card gets: gradient top bar, glow orb, 3D tilt on hover, count-up animation, staggered fade-in — all from the existing `KpiCard` component. No new components needed.

### Files Changed
| Action | File |
|--------|------|
| Modify | `src/pages/CashFlowManagement.tsx` — Replace lines 850-939 with 6 `KpiCard` instances in a responsive grid |

