

# UI/UX Bug Fixes and Improvements

## Bugs Found

### 1. Console Warning: Badge component cannot receive refs
**File:** `src/components/ui/badge.tsx`
The `Badge` component is a plain function, not wrapped in `React.forwardRef`. When used inside components that pass refs (like Radix UI's `Tooltip`), it throws a console warning. This happens in `ClientProfitTab.tsx` and likely other places.

**Fix:** Wrap `Badge` in `React.forwardRef`.

### 2. ClientOverviewTable: Action buttons invisible on mobile/touch
**File:** `src/components/dashboard/ClientOverviewTable.tsx` (line 93)
Action buttons (View, Add Funds) use `opacity-0 group-hover:opacity-100` which makes them permanently invisible on touch devices with no hover capability. Mobile users cannot access these actions at all.

**Fix:** Always show action buttons on mobile: `opacity-100 md:opacity-0 md:group-hover:opacity-100`.

### 3. ClientOverviewTable: Balance (BDT) column always shows "—"
**File:** `src/components/dashboard/ClientOverviewTable.tsx` (line 45)
The `fmtBdt` function is hardcoded to return `"—"` regardless of input, making the BDT column useless. Either implement it properly or remove the column to avoid user confusion.

**Fix:** Remove the dead BDT column since the pricing config isn't passed to this component — it adds visual clutter with zero value.

### 4. DeepDiveTable status filter doesn't match normalized statuses
**File:** `src/components/client-analytics/DeepDiveTable.tsx` (lines 101-121)
The status filter dropdown shows raw statuses (e.g., "Enable", "Disable") but filtering compares against raw values. If a user selects "Enable" from the dropdown, it works, but the label looks unprofessional. The filter options should show normalized labels.

**Fix:** Normalize the status labels in the filter dropdown to match the display labels.

### 5. AttentionPanel tabs overflow on mobile
**File:** `src/components/dashboard/AttentionPanel.tsx` (lines 14-32)
Four tab triggers (Alerts, Health, Risks, Billing) in a row without horizontal scrolling. On small screens, these tabs get cramped or wrap awkwardly.

**Fix:** Add horizontal scroll with `overflow-x-auto` and `flex-nowrap` on the `TabsList`.

## UX Improvements

### 6. KpiCard: count-up always starts from 0
**File:** `src/components/dashboard/KpiCard.tsx` (line 36)
Every re-render counts up from 0, which is disorienting on date range changes. It should animate from the previous value to the new value.

**Fix:** Use `prevRef.current` to start the animation from the previous numeric value instead of always from 0.

### 7. Empty state for ClientOverviewTable could be more helpful
Currently shows "No clients yet." — could include a CTA button to add the first client.

**Fix:** Add a "New Client" button in the empty state.

## Files Changed

| File | Changes |
|------|---------|
| `src/components/ui/badge.tsx` | Wrap in `forwardRef` to fix console warning |
| `src/components/dashboard/ClientOverviewTable.tsx` | Fix action buttons visibility on mobile; remove dead BDT column |
| `src/components/client-analytics/DeepDiveTable.tsx` | Normalize status labels in filter dropdown |
| `src/components/dashboard/AttentionPanel.tsx` | Add horizontal scroll for tabs on mobile |
| `src/components/dashboard/KpiCard.tsx` | Animate from previous value instead of 0 |

