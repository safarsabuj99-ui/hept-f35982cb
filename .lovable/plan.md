

# Change Week Start Day to Friday

## Problem
All date filters use Sunday (`weekStartsOn: 0`) as the week start. User wants Friday (`weekStartsOn: 5`).

## Changes

### 1. `src/components/DateRangeFilter.tsx`
- Change all `weekStartsOn: 0` to `weekStartsOn: 5` (3 occurrences: `startOfWeek` x2, `endOfWeek` x1)

### 2. `src/components/ClientDateFilter.tsx`
- Same change: all `weekStartsOn: 0` → `weekStartsOn: 5` (3 occurrences)

Two files, 6 total replacements. No other changes needed.

