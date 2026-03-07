

# Replace Custom Date Picker with Single Calendar Range Selection

## Problem
The custom date filter currently shows two separate calendars (From + To). You want a single calendar where the first click sets the start date and the second click sets the end date, selecting the range between them.

## Solution
Use react-day-picker's built-in `mode="range"` on a single `<Calendar>` component. First click picks "from", second click picks "to", and the range highlights automatically. Apply this change to both `DateRangeFilter` and `ClientDateFilter`.

## Changes

### 1. `src/components/DateRangeFilter.tsx`
- Replace the two-calendar grid with a single `<Calendar mode="range">` 
- Remove `customFrom` / `customTo` state, use a single `DateRange` state from react-day-picker
- Auto-apply the filter once both dates are selected (no need for "Apply Range" button, or keep it as confirmation)
- The popover stays compact — one calendar instead of two side-by-side

### 2. `src/components/ClientDateFilter.tsx`
- Same change: single `<Calendar mode="range">` replacing the two-calendar layout
- Same auto-apply or button-confirm behavior

### Key Code Pattern
```tsx
import { DateRange } from "react-day-picker";

const [range, setRange] = useState<DateRange | undefined>();

<Calendar
  mode="range"
  selected={range}
  onSelect={setRange}
  numberOfMonths={1}
  className="p-3 pointer-events-auto"
/>
```

First click sets `range.from`, second click sets `range.to` — exactly the UX you described.

| File | Change |
|------|--------|
| `src/components/DateRangeFilter.tsx` | Single calendar with `mode="range"` |
| `src/components/ClientDateFilter.tsx` | Single calendar with `mode="range"` |

