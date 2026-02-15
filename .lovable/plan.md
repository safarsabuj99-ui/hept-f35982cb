

# Remove Exchange Rate Control from Dashboard

## What Changes
Remove the BDT exchange rate control (the Rate input with +/- buttons and Save button) from the QuickActions strip on the admin dashboard. The strip will only keep the "Add Funds" and "Approve Pending" action buttons.

## Technical Details

### 1. Simplify `QuickActions` component (`src/components/dashboard/QuickActions.tsx`)
- Remove props: `rateValue`, `onRateChange`, `onSaveRate`, `rateSaving`
- Keep only `pendingCount` prop
- Remove the entire "Exchange rate control" section (the DollarSign icon, Rate label, +/- buttons, number input, and Save button)
- Remove unused imports: `Input`, `Minus`, `Loader2`, `DollarSign`

### 2. Update `AdminDashboard.tsx` (~line 176-182)
- Remove the rate-related props passed to `<QuickActions>`: `rateValue`, `onRateChange`, `onSaveRate`, `rateSaving`
- Only pass `pendingCount`
- Optionally clean up unused state (`rateValue`, `rateSaving`) and the `saveRate` function if they are no longer used elsewhere

