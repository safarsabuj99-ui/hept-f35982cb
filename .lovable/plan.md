

# Fix: Bulk Pause Button Visible When Campaign Toggle Control is Off (Client Side)

## Bug

When an admin disables `can_toggle_campaigns` for a client, the individual toggle switches correctly hide. However, **checkboxes still appear** on each campaign row, allowing multi-select. Once selected, the **bulk pause button appears** — bypassing the permission entirely.

## Root Cause — `src/components/client-analytics/DeepDiveTable.tsx`

Three locations check if a row is "selectable" using only `isActiveStatus(row.status)` but ignore the `canToggleCampaigns` prop:

1. **Desktop checkbox column** (line 317): `isSelectable = row.campaign_id && isActiveStatus(row.status)` — missing `canToggleCampaigns` check
2. **Mobile card checkbox** (line 785): Same issue
3. **Bulk action bar** (line 1224): Shows whenever `selectedIds.size > 0` — no guard

## Fix — 3 one-line changes in `DeepDiveTable.tsx`

1. **Desktop column cell** — add `canToggleCampaigns` to `isSelectable`:
   ```ts
   const isSelectable = canToggleCampaigns && row.campaign_id && isActiveStatus(row.status);
   ```

2. **Mobile card** — same fix:
   ```ts
   const isSelectable = canToggleCampaigns && row.campaign_id && isActiveStatus(row.status);
   ```

3. **Bulk action bar** — add guard:
   ```ts
   {canToggleCampaigns && selectedIds.size > 0 && (
   ```

This ensures that when `canToggleCampaigns` is `false`, no checkboxes render and no bulk actions appear — consistent with the individual toggle behavior.

## Files Modified

1. `src/components/client-analytics/DeepDiveTable.tsx` — 3 lines changed

