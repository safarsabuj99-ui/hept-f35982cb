

# Fix: Date Filter Showing All-Time Data When "Today" Is Selected

## Problem
Multiple pages initialize `dateRange` as `null` while the `DateRangeFilter` visually shows "Today" as active. Since we removed the mount-time `useEffect` from `DateRangeFilter`, these pages now fetch with `null` (all-time) on first render, creating a mismatch.

## Affected Pages

| Page | Current Init | Fix |
|------|-------------|-----|
| `src/pages/FinanceDashboard.tsx` | `null` + `periodLabel: "All Time"` | Today's range + `"Today"` |
| `src/pages/ExpenseManager.tsx` | `null` + `periodLabel: "All Time"` | Today's range + `"Today"` |
| `src/pages/WalletInventory.tsx` | `null` + `periodLabel: "All Time"` | Today's range + `"Today"` |
| `src/pages/CampaignMapping.tsx` | `null` | Today's range |
| `src/components/ClientProfitTab.tsx` | `null` | Today's range |

## Changes Per File

Each file gets the same pattern — initialize `dateRange` with today instead of `null`:

```typescript
// Before:
const [dateRange, setDateRange] = useState<DateRange | null>(null);
const [periodLabel, setPeriodLabel] = useState("All Time");

// After:
const [dateRange, setDateRange] = useState<DateRange | null>({
  from: startOfDay(new Date()),
  to: endOfDay(new Date())
});
const [periodLabel, setPeriodLabel] = useState("Today");
```

Add `startOfDay` and `endOfDay` imports from `date-fns` where not already imported.

For `CampaignMapping.tsx` and `ClientProfitTab.tsx` (no `periodLabel`), just fix the `dateRange` init.

