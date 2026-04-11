

## Fix: Overflow on Client & Ad Account Filter Labels and Boxes

**Problem:** The "Client" label and "Ad Account" label text plus the select boxes overflow their containers on desktop/tablet views, as shown in the red-marked areas of the screenshot.

**Root cause:** The wrapper divs have `min-w-0` but lack `overflow-hidden`. The buttons use `w-full sm:w-48` / `sm:w-52` which can still overflow when the parent flex container is tight. The label + button need to be constrained within a max-width container.

### File: `src/pages/CampaignMapping.tsx`

**Changes:**

1. **Client filter wrapper div (line 258):** Change from `"space-y-1 min-w-0"` to `"space-y-1 min-w-0 overflow-hidden shrink-0 sm:max-w-[200px]"` — constrains the entire filter block and clips any overflow.

2. **Ad Account filter wrapper div (line 307):** Change from `"space-y-1 min-w-0"` to `"space-y-1 min-w-0 overflow-hidden shrink-0 sm:max-w-[220px]"` — same treatment for ad account filter.

3. **Client filter button (line 266):** Change `className` to add `overflow-hidden` alongside existing `min-w-0`: `"w-full sm:w-[192px] h-9 text-sm justify-between font-normal min-w-0 overflow-hidden"`

4. **Ad Account filter button (line 315):** Same — add `overflow-hidden`: `"w-full sm:w-[208px] h-9 text-sm justify-between font-normal min-w-0 overflow-hidden"`

5. **Date Range wrapper div (line 353 area):** Add `min-w-0` to ensure it doesn't push filters to overflow.

These fixed-width values (`192px` = w-48, `208px` = w-52) match the current responsive widths but use explicit pixel values to prevent any flex expansion. Combined with `shrink-0` on the wrappers, the filters maintain their size without overflowing.

### No backend changes needed.

