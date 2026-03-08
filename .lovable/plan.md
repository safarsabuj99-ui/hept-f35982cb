

# Remove Auto-Spend from Activity Log

The Activity Log should only show manual/real transactions — no auto-spend entries at all.

## Changes

### `src/pages/ActivityLog.tsx`
- Remove the filter dropdown (All/Auto/Manual toggle) since we no longer need it
- Add `.not("description", "like", "auto_spend:%")` to the Supabase query so auto-spend rows are never fetched
- Remove the `isAuto()` helper and the Auto badge from the table rows

Single file change, straightforward cleanup.

