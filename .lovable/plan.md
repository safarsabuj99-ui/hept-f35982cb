

## Restore "Net Profit" KPI to Finance Overview

### What's missing

In the previous layout, Finance Overview showed a **Net Profit** card (= Revenue − COGS − OpEx). When the new 6-card waterfall was added, that card got replaced by **Take-Home Profit** (= Revenue − COGS − OpEx − Owner's Draw). Both numbers are useful and meaningfully different:

| Metric | Formula | Tells you |
|---|---|---|
| **Net Profit** (business profit) | Revenue − COGS − OpEx | What the business earned this period — before paying yourself |
| **Take-Home Profit** (owner profit) | Net Profit − Owner's Draw | What's left in the business after you withdrew your share |

Right now only Take-Home is displayed. The `netProfit` value is still being calculated in state (line 248) — it's just not rendered. So this is a pure UI restore, no math changes.

### New layout (7-card waterfall)

```
┌───────────────┬───────────────┬───────────────┐
│ Total Revenue │  Total COGS   │ Gross Profit  │
├───────────────┼───────────────┼───────────────┤
│  Total OpEx   │  Net Profit   │ Owner's Draw  │  ← Net Profit reintroduced
├───────────────┴───────────────┼───────────────┤
│                               │ Take-Home     │
│                               │ Profit        │
└───────────────────────────────┴───────────────┘
```

On `lg:` screens this becomes a clean 3-column grid with 7 cards (the 7th wraps to a new row, which is fine — it visually emphasizes Take-Home as the final answer).

The **P&L Summary** strip below grows from 6 columns to 7, inserting `= Net Profit` between `− OpEx` and `− Owner's Draw`:

```
Revenue → − COGS → = Gross → − OpEx → = Net Profit → − Owner's Draw → = Take-Home
```

This is now a fully accurate P&L waterfall that reads top-to-bottom like a real income statement.

### Calculation logic

No changes. Both numbers already exist:
```ts
const np = aggRevenue - aggCogs - opex;   // Net Profit (already in state)
setNetProfit(Math.round(np));             // Already set
setTakeHomeProfit(Math.round(np - draw)); // Already set
```

### Files Changed

| File | Change |
|---|---|
| `src/pages/FinanceDashboard.tsx` | (a) Insert a "Net Profit ({period})" card between the OpEx card and the Owner's Draw card in the 6-card grid (becomes 7 cards). (b) Insert a `= Net Profit` column in the Profit & Loss Summary strip (6 → 7 columns). (c) Both gated on `canViewProfit`, styled like Take-Home: success/destructive coloring based on sign, `TrendingUp` icon, mono font. |

Zero schema changes. Zero new state. Pure render addition using existing `netProfit` value.

### What you'll see immediately

For Today's data in your screenshot:
- Revenue ৳22,198 → − COGS ৳19,471 → = Gross ৳2,727
- − OpEx ৳0 → **= Net Profit ৳2,727** ← restored
- − Owner's Draw ৳0 → = Take-Home ৳2,727

When you have OpEx and Owner's Draw entries, the difference between Net Profit and Take-Home will become meaningful and visible side by side.

### Build time
~2 minutes. One file. Two small UI additions.

