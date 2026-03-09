

# Plan: Add Multi-Select with Bulk Pause to Campaign Analytics

## Overview
Add checkbox-based multi-select to `DeepDiveTable` with a floating action bar for bulk pausing selected campaigns.

## Changes

### `src/components/client-analytics/DeepDiveTable.tsx`

1. **Add checkbox column** as the first column using `Checkbox` component
   - Header checkbox for select-all (toggles all visible rows)
   - Row checkbox for individual selection
   - Only campaigns with `campaign_id` and `status === "active"` are selectable

2. **Add selection state** — `selectedIds: Set<string>` managed via `useState`
   - Clear selection when filters/search/page changes

3. **Add floating bulk action bar** — appears when `selectedIds.size > 0`
   - Shows count of selected campaigns (e.g., "3 selected")
   - "Pause All" button (destructive style)
   - "Clear" button to deselect all
   - Fixed at bottom of the table card with a subtle background

4. **Bulk pause logic**
   - Shows confirmation `AlertDialog` listing how many campaigns will be paused
   - Calls existing `pause-campaign` edge function sequentially for each selected campaign
   - Shows progress ("Pausing 2 of 5...")
   - On completion, shows success toast with count, clears selection, calls `onCampaignPaused`

5. **Update totals row** — add empty cell for the new checkbox column

### No changes needed to:
- `CampaignAnalyticsPanel.tsx` — it just passes data through
- `pause-campaign` edge function — reuse existing single-pause endpoint
- Database — no schema changes

