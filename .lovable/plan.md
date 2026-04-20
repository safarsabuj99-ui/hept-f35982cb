

## Add "Take-Home Profit" + "Balance Change" to Finance Overview

### What you're asking for

Two new top-level KPIs on `/admin/finance` (P&L Overview tab):

1. **Take-Home Profit** — what's actually left after **everything**: ad costs, operating expenses, AND owner's draw
2. **Balance Change** — net movement of your agency's cash position over the selected period (did total balance go up or down?)

### Current state (verified)

The Overview tab already shows 4 KPIs: Net Profit, Avg. Cost, Owner's Draw, Total OpEx — but:
- "Net Profit" = Revenue − COGS − OpEx → **doesn't subtract Owner's Draw** (so it overstates what's actually retained in the business)
- There's **no view of how your bank/cash balance moved** during the period

### New layout

The KPI grid becomes a clean **6-card** P&L flow that reads like a waterfall:

```
┌───────────────┬───────────────┬───────────────┐
│ Total Revenue │  Total COGS   │ Gross Profit  │
│  ৳XXX,XXX     │  ৳XXX,XXX     │  ৳XXX,XXX     │
├───────────────┼───────────────┼───────────────┤
│  Total OpEx   │ Owner's Draw  │ Take-Home     │
│  ৳XXX,XXX     │  ৳XXX,XXX     │ Profit        │
│               │               │  ৳XXX,XXX     │
└───────────────┴───────────────┴───────────────┘
```

Plus a new **"Balance Change ({period})"** card alongside Avg. Cost, showing:
```
Balance Change (This Month)
+ ৳45,000  ↑              ← positive = funds grew
Start: ৳120,000 → End: ৳165,000
```

### Calculation logic

**Take-Home Profit** (the real bottom line):
```
take_home_profit_bdt = revenue_bdt − cogs_bdt − total_opex_bdt − owner_draw_bdt
```

**Balance Change** over the selected period:
```
balance_change_bdt = sum(current balances now)
                   − sum(current balances at start of period)
```

Computed as:
- **End balance** = `SUM(agency_accounts.current_balance_bdt)` (live)
- **Start balance** = end balance **minus** every transaction (deposits, expenses, transfers in/out, withdrawals, returns) that happened **inside the date range**

This gives a self-balancing number: if you collected ৳200K, spent ৳150K on ads + opex, and the owner drew ৳30K, balance change = +৳20K (matches Take-Home Profit ± timing differences from receivables).

### Files Changed

| File | Change |
|---|---|
| `src/pages/FinanceDashboard.tsx` | (a) Add `takeHomeProfit` state = `netProfit − ownerDraw`; (b) Add `balanceChange`, `startBalance`, `endBalance` state; (c) Fetch agency_accounts + period transactions to compute balance delta; (d) Restructure KPI grid to 6-card P&L waterfall + Balance Change card; (e) Add "Take-Home Profit" row to the P&L Summary panel |

Zero schema changes. Zero RLS changes. Pure UI + math additions on top of existing data.

### What you'll see immediately

For your real numbers (this month):
- Revenue: ৳426,212
- − COGS: ৳373,965 → Gross Profit: ৳52,247
- − OpEx: (your OpEx)
- − Owner's Draw: (your draw)
- = **Take-Home Profit** (the real "what I actually kept" number)
- And a **Balance Change** showing whether cash on hand grew or shrank in the same window

### Permission gating
- "Take-Home Profit" respects `can_view_profit` (same as existing Net Profit card)
- "Balance Change" visible to anyone who can already see finance (no new permission needed)

### Build time
~6 minutes. One file. No migration.

