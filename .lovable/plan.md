

## Deep Dive `cpu_timeout` — Root Cause Found

### The Smoking Gun

**HEPT 15** (`00cf5889-cd29-49ae-803b-96a2b70df06b`, TikTok, 91 campaigns) has been failing every single deep-dive run for hours:
- 14:15, 14:00, 13:15, 13:00, 12:15 → all `cpu_timeout` after 3 attempts
- `chunk_index: nil`, `chunk_total: nil`, `date_from: nil`, `date_to: nil`
- Status `failed` after 3 attempts

**Translation: HEPT 15 is being sent as a SINGLE FULL JOB, NOT chunked.** Adaptive chunking is silently disabled for it.

### Why Chunking Is Disabled For HEPT 15

In `sync_account_stats`:
```
recommended_chunk_days: 25   ← should be 5 (or less)
total_rows_last_sync: 1      ← BUG: it never measured the real workload
avg_rows_per_day: 0.04
last_error: "The signal has been aborted"  ← it timed out…
consecutive_failures: 0      ← …but wasn't counted as failure
```

In `sync-orchestrator/index.ts` line 127-128:
```ts
const chunkDays = isFastLane ? 25 : (stat?.recommended_chunk_days ?? 5);
const useChunking = !isFastLane && chunkDays < TOTAL_WINDOW_DAYS;  // 25 < 25 = false
```

Because `recommended_chunk_days = 25` equals `TOTAL_WINDOW_DAYS = 25`, **chunking is bypassed** → orchestrator inserts ONE job covering the whole 25-day window → `sync-deep-dive` tries to fetch ~1000 rows × 91 campaigns × 25 days from TikTok → CPU timeout.

### Three Cascading Bugs

| # | Bug | Effect |
|---|-----|--------|
| 1 | `mark_parent_complete` RPC only updates stats from the LAST chunk processed (1 row), leaving `total_rows_last_sync = 1` and `recommended_chunk_days = 25` even after a heavy account is detected | Adaptive chunking never kicks in |
| 2 | When a job is `chunk_strategy = "full"` and times out, worker doesn't downgrade `recommended_chunk_days` for next run | Account stays stuck on "full" forever |
| 3 | `consecutive_failures` is reset on every "successful" stats update (which happens even after timeout because the RPC writes from the chunk side) | Failure-based fallback never triggers |

### The Smart Fix

**Three changes — all server-side, no UI work needed.**

#### 1. `sync-orchestrator` — Treat unknown/heavy accounts as chunked by default
```text
Old: useChunking = chunkDays < 25
New: useChunking = !isFastLane && (
       chunkDays < 25                        // explicit recommendation
    || stat?.consecutive_failures >= 1       // any recent failure
    || stat?.total_rows_last_sync >= 200     // ≥200 rows from last sync
    || !stat                                 // never synced before
)
```
**Result**: HEPT 15 → 5 chunks of 5 days each instead of 1 chunk of 25 days.

#### 2. `sync-queue-worker` — Auto-demote stats on timeout
When a `chunk_strategy = "full"` job times out OR exhausts retries:
```text
UPDATE sync_account_stats
SET recommended_chunk_days = 5,
    consecutive_failures = consecutive_failures + 1,
    last_error = <error>
WHERE ad_account_id = <id>;
```
**Result**: Even if step 1 missed an edge case, the account auto-shrinks for the next orchestrator run.

#### 3. `mark_parent_complete` (DB function) — Fix stats accumulation
Currently writes per-chunk row count. Change it to **SUM all chunks under the parent** and update `total_rows_last_sync` only when ALL siblings are done.
```sql
-- Pseudo:
total_rows = SUM(rows_synced) WHERE parent_job_id = parent
IF all chunks done THEN
  UPDATE sync_account_stats SET
    total_rows_last_sync = total_rows,
    avg_rows_per_day = total_rows / window_days,
    recommended_chunk_days = CASE
      WHEN total_rows > 800 THEN 3
      WHEN total_rows > 400 THEN 5
      WHEN total_rows > 150 THEN 10
      ELSE 25
    END,
    consecutive_failures = 0,
    last_success_at = now();
```

#### 4. Bonus: Recovery action — reset HEPT 15 immediately
Manually patch `sync_account_stats` so the next orchestrator run chunks it:
```sql
UPDATE sync_account_stats
SET recommended_chunk_days = 3, consecutive_failures = 1
WHERE ad_account_id = '00cf5889-cd29-49ae-803b-96a2b70df06b';
```

### Why This Permanently Fixes The Problem

| Scenario | Before | After |
|----------|--------|-------|
| New unmeasured account | ❌ Full window → timeout | ✅ Default to 5-day chunks |
| Account that just timed out | ❌ Retries same full window 3× | ✅ Immediately switches to chunked next run |
| Account recovers (light) | ❌ Stuck on small chunks | ✅ Auto-grows to 25 if total_rows < 150 |
| Stats updated mid-chunk | ❌ Sees only 1 row, misclassifies | ✅ SUMs across siblings, accurate classification |

### Files To Change
- `supabase/functions/sync-orchestrator/index.ts` (line 127-128 — gating logic)
- `supabase/functions/sync-queue-worker/index.ts` (after permanent failure block — demote stats)
- New SQL migration: `mark_parent_complete` rewrite + immediate stats patch for HEPT 15

### Build Time
~25 minutes. Pure backend. No UI changes. No data loss. Self-healing for all future heavy accounts.

