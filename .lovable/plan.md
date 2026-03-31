

# Plan: Bulk Activate Paused Campaigns (Admin Only) via CampaignAnalyticsPanel

## Overview
Allow admins to multi-select paused campaigns and activate them all with a single click. The bulk activate sends one API call per campaign (using `Promise.allSettled` for parallelism). This is admin-only — clients never see selection on paused campaigns.

## Changes

### 1. `src/components/client-analytics/DeepDiveTable.tsx`

- Add `isAdmin?: boolean` prop (default `false`)
- Add `isPausedStatus` helper: checks for `paused`, `disable`, `guard_paused`
- Expand `selectableRows` to include paused campaigns when `isAdmin` is true
- Update `isSelectable` in both desktop (line 317) and mobile (line 785) to also allow paused rows when `isAdmin`
- Add `handleBulkActivate` function — parallel batches via `Promise.allSettled`, calls `pause-campaign` with `action: "enable"` for each selected paused campaign
- Add `showBulkActivate` state and confirmation dialog (similar to existing bulk pause dialog)
- Update floating bulk action bar:
  - Determine if selected campaigns are active, paused, or mixed
  - Show "Pause All" for active selections, "Activate All" for paused selections, both for mixed
- Update `selectableRows` memo to include paused campaigns when `isAdmin`

### 2. `src/components/client-analytics/CampaignAnalyticsPanel.tsx`

- Add `isAdmin?: boolean` prop, pass through to `DeepDiveTable`

### 3. `src/pages/CampaignMapping.tsx`

- Pass `isAdmin={isAdmin}` to `CampaignAnalyticsPanel` (already has `const isAdmin = role === "admin"`)

### 4. `src/pages/AdAccountDetail.tsx`

- Import `useAuth`, pass `isAdmin={role === "admin"}` to `CampaignAnalyticsPanel`

## Edge Function — No Changes Needed

The existing `pause-campaign` function already supports `action: "enable"`. The frontend will call it in parallel batches from `handleBulkActivate`, no bulk endpoint needed.

## Files Modified

1. `src/components/client-analytics/DeepDiveTable.tsx` — isAdmin prop, paused selection, bulk activate handler + UI
2. `src/components/client-analytics/CampaignAnalyticsPanel.tsx` — Pass through isAdmin
3. `src/pages/CampaignMapping.tsx` — Pass isAdmin
4. `src/pages/AdAccountDetail.tsx` — Pass isAdmin

