

# Add Date Preset Filter to Spend Report Page

## Overview
Replace the raw "From" / "To" date inputs on the Spend Report page with the existing `DateRangeFilter` component (preset buttons: Today, Yesterday, This Week, Last Week, This Month, Last Month, All Time, Custom).

## Changes

### 1. Update `src/components/DateRangeFilter.tsx`
Add two missing presets:
- **Yesterday** -- uses `subDays(now, 1)` for both from/to
- **Last Week** -- uses `subWeeks(now, 1)` with `startOfWeek`/`endOfWeek`

Updated presets list order: All Time, Today, Yesterday, This Week, Last Week, This Month, Last Month, Custom.

### 2. Update `src/pages/SpendReport.tsx`
- Remove the `dateFrom` / `dateTo` string state and the two `<Input type="date">` elements
- Import and render `DateRangeFilter` inside the filter card
- Store the selected range as `Date | null` objects
- Update the filtering logic to compare against `Date` objects instead of ISO strings

## Technical Details

**DateRangeFilter.tsx additions:**
- Import `subDays`, `subWeeks` from `date-fns`
- Add `"yesterday"` and `"last_week"` to the `DatePreset` type
- Add cases in `getPresetRange()` for these new presets

**SpendReport.tsx changes:**
- Replace `dateFrom`/`dateTo` string state with a single `dateRange: DateRange | null` state
- Filter logic: compare `new Date(s.date)` against `dateRange.from` and `dateRange.to`
- The `DateRangeFilter` component slots into the existing filter Card alongside Platform and Client selectors

