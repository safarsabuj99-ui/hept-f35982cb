

## Fix: Use Original Platform Date for Synced Spend Data

### Problem
The `sync-fast-lane` and `sync-deep-dive` background functions always record spend on **today's date** (`new Date().toISOString().split("T")[0]`), regardless of when the actual spend occurred on Meta/TikTok/Google. When a campaign spent $30 on February 10th, it should appear as February 10th in the system -- not the date the sync ran.

The main `sync-ad-spend` function already handles this correctly for Meta by using `row.date_start` from the Insights API. The two background cron functions need the same fix.

### What Changes

**File: `supabase/functions/sync-fast-lane/index.ts`**
- Instead of syncing only "today", fetch the **last 7 days** of spend data per account
- For each day in the range, generate or fetch the spend and upsert with the **actual date** from the platform
- This ensures that if a sync runs on Feb 12, spend from Feb 10 is recorded as Feb 10
- The upsert on `ad_account_id,date` prevents duplicates

**File: `supabase/functions/sync-deep-dive/index.ts`**
- Same approach: iterate over the **last 7 days** instead of using only today
- For each campaign and each day, upsert performance metrics with the **correct historical date**
- The upsert on `campaign_id,date` prevents duplicates

### Technical Details

Both functions currently do:
```
const today = new Date().toISOString().split("T")[0];
// ... uses `date: today` for all records
```

Updated to:
```
// Generate last 7 days of dates
const dates: string[] = [];
for (let d = 0; d < 7; d++) {
  const dt = new Date();
  dt.setDate(dt.getDate() - d);
  dates.push(dt.toISOString().split("T")[0]);
}

// For each account, upsert spend for EACH date
for (const date of dates) {
  // upsert with date from the platform, not today
}
```

This means:
1. When the cron job runs, it backfills the last 7 days with correct dates
2. The upsert ensures no duplicate records (same account + same date = update, not insert)
3. The Spend Report and Client Reports pages will show data on the correct dates automatically since they already read the `date` column

No database schema changes needed. No frontend changes needed -- the UI already displays the `date` field from the database.

