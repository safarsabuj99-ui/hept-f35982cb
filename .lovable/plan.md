

## Plan: Reset USD Inventory to Fresh State

### Problem
The `auto-snapshot-usd` edge function (runs every 5 min) re-created a snapshot after the data reset, carrying forward a stale $-1,945 balance. This old snapshot is now the "carry forward" value.

### Fix
Single database operation — delete all rows from `usd_inventory_snapshots` again. The next auto-snapshot cycle will then calculate from zero (no purchases + no spend = $0 balance).

| Action | Detail |
|--------|--------|
| Delete `usd_inventory_snapshots` | Remove all auto-generated snapshots |

No code changes needed. The auto-snapshot function will naturally create a fresh $0 snapshot on its next run.

