

## Plan: Reorder "All Time" in Date Filters

Both `DateRangeFilter.tsx` and `ClientDateFilter.tsx` currently have "All Time" as the **first** preset button. You want it moved to appear **after "Last Month"** and before "Custom".

### Changes

**File 1: `src/components/DateRangeFilter.tsx`** (line 21-29)
Reorder the presets array:
```
Today → Yesterday → This Week → Last Week → This Month → Last Month → All Time → Custom
```

**File 2: `src/components/ClientDateFilter.tsx`** (line 25-33)
Same reorder applied.

Two files changed, no logic changes — just array order.

