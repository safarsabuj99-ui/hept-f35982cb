

## Clear Data & Add Configurable Sync Start Date

### Problem
Currently, the sync functions use hardcoded date ranges (last 7 or 30 days). You want to:
1. Clear all existing synced data from the system
2. Set a custom start date in Settings (e.g., February 1st)
3. All sync functions pull data from that date forward instead of hardcoded ranges

### What Changes

**1. Database: Add `sync_start_date` setting + Clear old data**

- Insert a new row in the `settings` table: `key = 'sync_start_date'`, `value = '2025-01-01'` (default)
- Truncate (clear) these tables of all existing synced data:
  - `daily_ad_spend`
  - `campaign_performance`
  - `campaign_mappings`

**2. Settings Page: Add Date Picker**

Add a new card in `src/pages/Settings.tsx` with a date picker where the admin can set the "Sync Start Date". When saved, all future syncs will pull data from this date to today.

**3. Edge Functions: Read `sync_start_date` from settings**

Update three edge functions to read the `sync_start_date` setting and use it as the start of the date range:

- **`sync-ad-spend/index.ts`**: Change `since.setDate(since.getDate() - 30)` to read from the setting. The Meta Insights API call will use this date as the `since` parameter.
- **`sync-fast-lane/index.ts`**: Replace the hardcoded 7-day loop with a dynamic range from `sync_start_date` to today.
- **`sync-deep-dive/index.ts`**: Same -- replace the 7-day loop with the configurable date range.

### Technical Details

**Database migration:**
```sql
INSERT INTO settings (key, value)
VALUES ('sync_start_date', '2025-01-01')
ON CONFLICT (key) DO NOTHING;

TRUNCATE daily_ad_spend;
TRUNCATE campaign_performance;
TRUNCATE campaign_mappings;
```

**Settings UI addition:** A date picker card using the Shadcn Calendar/Popover component, saving the selected date as a string (YYYY-MM-DD) to the `settings` table.

**Edge function date logic (all three functions):**
```typescript
// Read configurable start date
const { data: dateSetting } = await supabase
  .from("settings").select("value").eq("key", "sync_start_date").maybeSingle();
const startDate = dateSetting?.value || "2025-01-01";

// Generate date range from startDate to today
const dates: string[] = [];
const start = new Date(startDate);
const end = new Date();
for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
  dates.push(d.toISOString().split("T")[0]);
}
```

**Files to modify:**
- `src/pages/Settings.tsx` -- add Sync Start Date card
- `supabase/functions/sync-ad-spend/index.ts` -- use setting for date range
- `supabase/functions/sync-fast-lane/index.ts` -- use setting for date range
- `supabase/functions/sync-deep-dive/index.ts` -- use setting for date range

**Database:** One migration to insert the setting and clear existing data.

