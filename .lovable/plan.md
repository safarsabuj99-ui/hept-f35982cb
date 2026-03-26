

## Two Changes: Smaller KPI Cards on Mobile + Top 5 Profitability

### 1. KPI Card — Smaller text on mobile

**File: `src/components/dashboard/KpiCard.tsx`**

Reduce padding, font sizes, and icon size on small screens:

- **Line 108** — Card padding: `p-5` → `p-3 sm:p-5`
- **Line 111** — Title: `text-[11px]` → `text-[9px] sm:text-[11px]`
- **Line 115** — Value: `text-2xl` → `text-lg sm:text-2xl`
- **Line 127** — Icon container: `h-10 w-10` → `h-8 w-8 sm:h-10 sm:w-10`
- **Line 130** — Icon: `h-5 w-5` → `h-4 w-4 sm:h-5 sm:w-5`

### 2. Profitability Table — Show only top 5 by spend

**File: `src/components/dashboard/ProfitabilityTable.tsx`**

- **Line 200** — Change sort to by `spendUsd` descending and slice to 5:
  ```
  setRows(result.sort((a, b) => b.spendUsd - a.spendUsd).slice(0, 5));
  ```

Two files, minimal changes.

