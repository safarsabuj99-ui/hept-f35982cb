

## Plan: Auto-Refresh USD Balance Every 5 Minutes

### Problem
The current auto-snapshot runs monthly. You want the USD balance to stay fresh — recalculated every 5 minutes, especially after data syncs pull in new spend.

### Solution
Change the edge function to run every 5 minutes and **upsert** (update-or-insert) today's snapshot instead of inserting a new row each time. This keeps the balance current without flooding the snapshots table.

### Changes

**1. Update `supabase/functions/auto-snapshot-usd/index.ts`**
- Change the insert to an **upsert** on `snapshot_date` so that repeated runs on the same day just update the existing row instead of creating duplicates.
- Add a unique constraint on `snapshot_date` to support upsert.

**2. Database: Add unique constraint**
```sql
ALTER TABLE usd_inventory_snapshots 
  ADD CONSTRAINT usd_inventory_snapshots_snapshot_date_key UNIQUE (snapshot_date);
```

**3. Update cron schedule**
- Delete the existing monthly cron job
- Create a new one running every 5 minutes: `*/5 * * * *`

**4. Update `src/pages/WalletInventory.tsx`**
- Change the "Auto: Monthly" badge to "Auto: Every 5 min"

### How It Works
- Every 5 minutes, the function calculates: `Last Snapshot Balance + Purchases Since - Spend Since`
- It upserts today's date as the snapshot — so during the day, today's row keeps getting refreshed
- At midnight when a new day starts, yesterday's snapshot becomes the historical record
- The frontend always reads the latest snapshot, so the balance stays accurate within 5 minutes of any sync

### Files to Change

| File | Change |
|------|--------|
| Database | Add unique constraint on `snapshot_date`; reschedule cron to `*/5 * * * *` |
| `supabase/functions/auto-snapshot-usd/index.ts` | Change `.insert()` to `.upsert()` with `onConflict: 'snapshot_date'` |
| `src/pages/WalletInventory.tsx` | Update badge text |

