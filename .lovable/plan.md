

## Smart Sync Gating — 3 Critical Bug Fixes

### Bug Diagnosis

FARISH 2 has $18+ active spend in `daily_metrics` today, but Deep-Dive is being skipped because `consecutive_zero_runs = 105`. Three compounding bugs:

| # | Bug | Impact |
|---|---|---|
| **1** | Fast-Lane Meta API requests **16-month window** (Jan 2025 → today) instead of today-only, missing today's small/late-arriving rows | Fast-Lane reports 0 even when account has spend |
| **2** | `consecutive_zero_runs` counter only resets when Fast-Lane sees rows — never when Deep-Dive succeeds or `daily_metrics` shows fresh data | Counter climbs to 100+ forever for low-spend accounts |
| **3** | 24-hour heartbeat is too long — accounts can miss a full day of Deep-Dive sync | Unacceptable data lag |

### Fixes

**Fix 1 — Fast-Lane: Narrow Meta window to last 3 days**
- Change `startDateStr` for Meta path from `getAccountStartDate()` to **last 3 days** (catches today + late attribution from yesterday + day-before)
- Keeps API response small (~3 rows per campaign instead of hundreds), reliable, and ensures today's data is included
- Other platforms (Google/TikTok) already chunk properly — only Meta needs this

**Fix 2 — Counter resets based on REAL activity (not just Fast-Lane)**
After Fast-Lane completes its run, also check `daily_metrics` for fresh data per account:
```typescript
// After main sync loop, query daily_metrics for last 24h activity per account
const { data: recentMetrics } = await supabase
  .from('daily_metrics')
  .select('campaign_id, spend')
  .gte('data_date', threeDaysAgo)
  .gt('spend', 0);
// Map campaign_id → ad_account_id via campaigns table
// If account has ANY recent spend in daily_metrics → treat as "active" → reset counter
```
This way, even if Fast-Lane misses, Deep-Dive's own success will reset the counter on the next Fast-Lane tick.

**Fix 3 — Tighter heartbeat: 6 hours instead of 24**
In `sync-orchestrator`, change `HEARTBEAT_HOURS = 24` → `HEARTBEAT_HOURS = 6`. Even "silent" accounts get a Deep-Dive every 6h max, ensuring no account can drift more than 6h behind.

**Fix 4 — One-shot reset for stuck accounts**
Run a one-time SQL update to reset `consecutive_zero_runs = 0` for any account that has ANY `daily_metrics` row in the last 24 hours with spend > 0. This immediately unblocks FARISH, FARISH 2, and any other stuck accounts so Deep-Dive resumes on the next orchestrator tick.

### Files Changed

| File | Change |
|---|---|
| `supabase/functions/sync-fast-lane/index.ts` | Meta path: use 3-day window. Add `daily_metrics` activity check that resets counter based on real spend |
| `supabase/functions/sync-orchestrator/index.ts` | `HEARTBEAT_HOURS = 6` (was 24) |
| Migration | One-shot `UPDATE sync_account_stats SET consecutive_zero_runs = 0 WHERE ad_account_id IN (accounts with recent daily_metrics activity)` |

### Why This Is Bulletproof

- **Self-healing from 3 angles**: Fast-Lane sees rows → reset. Deep-Dive populates `daily_metrics` → next Fast-Lane resets the counter. Heartbeat every 6h forces a sync regardless.
- **No false skips**: Real spend in `daily_metrics` is the ultimate truth — if it's there, the account is alive.
- **Backward compatible**: All gating logic stays; we just plug the holes that caused false negatives.
- **Immediate recovery**: One-shot SQL reset clears the current backlog instantly.

### Build Time
~10 minutes. Zero schema risk — pure logic fixes + a data correction.

