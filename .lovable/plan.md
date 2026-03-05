

# Replace Plain Date Input with Calendar Date Picker on Client Detail

## Current State
The Client Detail Profile tab already has a "Data Start Date" field (line 457), but it uses a plain `<Input type="date">` HTML input. This is inconsistent with the NewClient form which now uses a proper Popover + Calendar date picker.

## Change

**File: `src/pages/ClientDetail.tsx`**

Replace the `<Input type="date">` at line 457 with a Popover + Calendar date picker (same pattern used in `NewClient.tsx`):
- Add imports for `Calendar`, `Popover`, `PopoverTrigger`, `PopoverContent`, `CalendarIcon`, `format`, `cn`
- Convert the string-based `dataFetchStartDate` state to work with the Calendar component (parse string to Date for display, format Date back to `yyyy-MM-dd` string on select)
- Keep the existing save logic unchanged since it already saves `dataFetchStartDate` as a string to the database

| File | Change |
|------|--------|
| `src/pages/ClientDetail.tsx` | Replace plain date input with Popover + Calendar picker |

