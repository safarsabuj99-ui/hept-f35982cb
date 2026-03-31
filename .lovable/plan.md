

## Update Profit/Loss Widget to Show Gross Profit, OpEx, and Net Profit

### What Changes

Restructure the P&L widget from the current 3-row layout (Revenue, Cost, Margin) to a proper P&L breakdown with 5 rows:

```text
Revenue              ৳12,577
Cost (WAC: 130)     -৳10,997
────────────────────────────
Gross Profit          ৳1,580
OpEx                   -৳536
────────────────────────────
Net Profit           ৳1,044
```

### File: `src/components/ProfitLossWidget.tsx`

1. **Add `totalOpexBdt` to `ProfitData` interface** and rename `totalProfitBdt` to `grossProfitBdt`, add `netProfitBdt`

2. **Fetch `agency_expenses`** (date-filtered, excluding `Owner_Draw` category — same logic as FinanceDashboard):
   - Sum `amount_bdt` for all non-Owner_Draw expenses in the date range
   - Store as `totalOpexBdt`

3. **Update calculations**:
   - `grossProfitBdt = Revenue - COGS`
   - `netProfitBdt = grossProfitBdt - totalOpexBdt`

4. **Update UI** to show 5 rows with two separator lines:
   - Revenue
   - Cost (WAC)
   - **── Gross Profit** (with green/red coloring)
   - OpEx
   - **── Net Profit** (bold, with trending icon and badge percentage based on net profit)

5. **Badge** shows net profit margin percentage instead of gross

Single file change. No database modifications.

