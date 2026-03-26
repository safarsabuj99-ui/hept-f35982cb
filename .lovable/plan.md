

## Fix Ad Guard + Remove Guard History

### Problem 1: Ad Guard Not Pausing on Actual Ad Platforms

**Root Cause (confirmed via logs and code):**
- The DB trigger `auto_pause_on_debit` correctly marks campaigns as `guard_paused` in the database when balance drops below threshold
- However, **no cron job is scheduled** to invoke the `ad-guard-check` edge function — the `pg_cron` extension is enabled but `cron.schedule()` was never called
- Additionally, the database reports **"There are no triggers"** — meaning the triggers (`trg_auto_pause_on_debit`, `trg_check_auto_resume`, `trg_auto_debit_on_spend`) were likely dropped and need to be recreated
- Result: campaigns show as "guard_paused" in your dashboard but remain running on Meta/TikTok/Google

**Fix:**
1. **New migration** to:
   - Recreate all 3 critical triggers (`trg_auto_pause_on_debit`, `trg_check_auto_resume`, `trg_auto_debit_on_spend`) 
   - Schedule `ad-guard-check` to run every 5 minutes via `pg_cron` + `pg_net` (HTTP call to edge function)
   - This ensures campaigns are actually paused on platform APIs within 5 minutes of balance dropping

2. **Improve `ad-guard-check` edge function** to add retry logging and ensure failed API pauses keep campaigns as `guard_paused` (not marking them `paused` until platform confirms)

### Problem 2: Remove Guard History

**What gets removed:**
- The entire "Guard History" card (lines 492-584) from `AutomationConfigTab.tsx`
- Related state: `guardHistory`, `pauseCount`, `resumeCount`, `lastEvent`, `relativeTime`, `parseDescription` 
- The `History` icon import
- The audit_log query for guard events
- **No database changes needed** — we keep the audit_logs table and the `guard_paused_at` / `guard_resume_window_hours` profile columns (they're used by the guard logic itself)

### Files Changed
- **New migration**: Recreate triggers + schedule cron job
- **`supabase/functions/ad-guard-check/index.ts`**: Minor improvement — don't mark campaigns as processed if API call fails
- **`src/components/AutomationConfigTab.tsx`**: Remove Guard History card and related code

