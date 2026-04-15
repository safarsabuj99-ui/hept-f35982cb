

## Plan: Delete Manual Spends & Refresh Balance

### What exists
Two manual spend records in `usd_manual_spends`:
1. $447 — "Previous due dollar paid from USD" (Apr 12)
2. $85 — "Previous due dollar paid from USD" (Apr 12)

### Actions
1. **Delete all rows** from `usd_manual_spends` using the insert tool (DELETE statement)
2. **Invoke `auto-snapshot-usd`** to recalculate the balance without manual spends

### Impact
The available balance will increase by $532 (the total of deleted manual spends). Since the current baseline is −$30, the new balance will be −$30 + $0 (no new purchases/spend since baseline) = approximately −$30 (unchanged from baseline, since manual spends were the only delta being subtracted).

### Files
| Action | Detail |
|--------|--------|
| Data delete | Remove all rows from `usd_manual_spends` |
| Test | Re-invoke `auto-snapshot-usd` to verify updated balance |

