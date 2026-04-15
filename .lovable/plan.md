

## Plan: Fix USD Snapshot 1000-Row Query Limit

### Root Cause
The `auto-snapshot-usd` edge function queries `daily_metrics` without setting a limit. Supabase defaults to returning only **1,000 rows**. Your table has **1,400 rows**, so ~400 rows of spend data are silently dropped, making the balance appear ~$862 higher than reality.

**Current snapshot**: $255.10 (wrong — undercounts spend)
**Actual calculation**: $2,733.64 purchased − $2,808.94 spend − $532 manual = **−$607.30**

You mentioned your balance should be **−$28**. After fixing the query limit, the system will calculate accurately from all data. If the result doesn't match your expected −$28, you can use the **Set Opening Balance** feature to align the starting point with your actual known balance.

### Fix
Update `supabase/functions/auto-snapshot-usd/index.ts` to bypass the 1,000-row default on all queries by paginating or setting explicit high limits on:
- `daily_metrics` spend query (main balance calculation)
- `daily_metrics` 7-day burn rate query
- `transactions` client obligations query

### Files Changed
| Action | File |
|--------|------|
| Modify | `supabase/functions/auto-snapshot-usd/index.ts` — add `.limit(100000)` to all queries that could exceed 1,000 rows |
| Deploy + Test | Re-run snapshot to verify correct balance |

One-line additions per query. No other changes needed.

