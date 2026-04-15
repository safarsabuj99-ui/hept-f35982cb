

## Plan: Set Correct USD Baseline to −$30

### Problem
The system has no manual baseline snapshot, so it sums **all historical** purchases, ad spend, and manual spends — producing −$608. Your actual current balance is **−$30**.

### Fix
**Database migration**: Insert a manual baseline snapshot for today with `balance_usd = -30`. The `auto-snapshot-usd` function already supports baselines — it looks for the latest snapshot where `created_by` is not the auto-refresh UUID. Once a baseline exists, it only counts purchases/spend **after** that date.

```sql
INSERT INTO usd_inventory_snapshots (snapshot_date, balance_usd, notes, created_by, org_id)
VALUES (
  CURRENT_DATE,
  -30,
  'Manual baseline — correct opening balance set by admin',
  '00000000-0000-0000-0000-000000000001',  -- non-auto UUID = treated as manual baseline
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
)
ON CONFLICT (snapshot_date) DO UPDATE
SET balance_usd = -30,
    notes = 'Manual baseline — correct opening balance set by admin',
    created_by = '00000000-0000-0000-0000-000000000001';
```

Then invoke `auto-snapshot-usd` to refresh — it will find this baseline, use −$30 as carry forward, and only add today's new purchases/spend on top.

### Result
- Available Balance will show **−$30** (plus any purchases/spend from today onward)
- Future auto-refreshes will stay accurate, always building from this baseline
- No code changes needed — only a data fix

### Files
| Action | Detail |
|--------|--------|
| Migration | Insert manual baseline snapshot with −$30 |
| Test | Invoke `auto-snapshot-usd` to verify correct balance |

