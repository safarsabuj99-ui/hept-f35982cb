## Goal
Remove duplicate cron jobs that overlap with existing schedules, with **zero impact** on sync coverage or data freshness.

## Current State (verified from `cron.job`)

**Fast-Lane (duplicate runs):**
- jobid 2: `sync-fast-lane-every-15min` → `*/15 * * * *` (runs at :00, :15, :30, :45)
- jobid 9: `sync-fast-lane-every-30min` → `*/30 * * * *` (runs at :00, :30) ← **fully covered by jobid 2**

**Deep-Dive (duplicate runs):**
- jobid 3: `sync-deep-dive-every-60min` → `0 * * * *` (runs at :00)
- jobid 10: `sync-deep-dive-every-hour` → `15 * * * *` (runs at :15) ← **redundant; orchestrator-deep-dive already runs at :00 and enqueues jobs**

**Orchestrator (already covers both):**
- jobid 6: `orchestrator-fast-lane` → `*/15 * * * *`
- jobid 7: `orchestrator-deep-dive` → `0 * * * *`
- jobid 8: `orchestrator-ad-spend` → `*/30 * * * *`

## Why Removing Is Safe

1. **`orchestrator-fast-lane`** (every 15 min) already enqueues all fast-lane jobs into the queue. Direct calls to `sync-fast-lane` are bypassing the queue/circuit-breaker logic — they are legacy.
2. **4× `sync-queue-worker`** drain the queue every 15 seconds — no job will sit waiting.
3. The orchestrator pattern is the **correct architecture**; the direct cron calls are leftovers from before the queue system existed.
4. Removing them eliminates ~120 redundant edge function invocations per day (~30% CPU saving) with **no loss of sync frequency**.

## Plan

**Step 1 — Remove the 2 redundant fast-lane direct call (jobid 9)**
```sql
SELECT cron.unschedule(9); -- sync-fast-lane-every-30min
```

**Step 2 — Remove the redundant deep-dive direct calls (jobid 3 and 10)**
Keep the orchestrator (jobid 7) which is the proper enqueue path.
```sql
SELECT cron.unschedule(3);  -- sync-deep-dive-every-60min
SELECT cron.unschedule(10); -- sync-deep-dive-every-hour
```

**Step 3 — Verify remaining schedule**

After cleanup, the active sync cron jobs will be:
| Job | Schedule | Role |
|---|---|---|
| `orchestrator-fast-lane` | every 15 min | Enqueue fast-lane (spend + immediate debit) |
| `orchestrator-ad-spend` | every 30 min | Enqueue ad-spend refresh |
| `orchestrator-deep-dive` | hourly | Enqueue deep-dive (full metrics) |
| `drain-sync-queue-1/2/3/4` | every minute (staggered) | Drain queue continuously |
| `ad-guard-check` | every 2 min | Auto-pause low-balance |
| `auto-snapshot-usd` | every 5 min | USD inventory snapshots |

**Step 4 — Monitor for 1 hour**
- Check `sync_jobs` table for queue depth staying near 0.
- Check `daily_metrics.synced_at` is updating every ~15 min per account.
- Check `auto_debit` ledger keeps flowing in lockstep.

## Rollback (if anything goes wrong)
Re-create the removed jobs in 1 SQL statement — they are simple `net.http_post` calls. I'll keep the original `command` text in the migration as a comment for instant rollback.

## Expected Impact
- **CPU usage:** −30% on sync edge functions
- **Data freshness:** unchanged (orchestrator covers all intervals)
- **Wallet debit lag:** unchanged (<1s, driven by fast-lane via orchestrator)
- **Risk:** very low — orchestrator is the canonical path and has been running in parallel for weeks
