

## Job Queue + Worker Pattern for Deep-Dive Sync (1000+ campaign scale)

### Goal
Replace single-shot Deep-Dive sync with a queue-based architecture that scales to 1000+ campaigns without CPU timeouts.

### Architecture

```text
[Cron every 1min] → [drain-sync-queue worker]
                          ↓ pulls 10 jobs
                    [process 10 campaigns in ~10s]
                          ↓
                    [mark done / retry failed]

[Orchestrator] → enqueues all campaigns into sync_jobs
[Worker]       → drains queue 10 at a time, exits cleanly under 25s
```

### Database changes (1 migration)

**New table: `sync_jobs`**
- `id` uuid PK
- `ad_account_id` uuid (FK)
- `function_name` text ('sync-deep-dive' | 'sync-fast-lane')
- `status` text ('pending' | 'processing' | 'done' | 'failed')
- `attempts` int default 0
- `max_attempts` int default 3
- `last_error` text
- `error_code` text
- `scheduled_at` timestamptz default now()
- `started_at`, `completed_at` timestamptz
- `org_id` uuid
- Indexes: `(status, scheduled_at)`, `(ad_account_id, function_name)` unique partial where status in ('pending','processing')
- RLS: admin-only via `get_user_org_id`

### Edge function changes

**1. New function: `sync-queue-worker`** (verify_jwt = false)
- Pulls **10 pending jobs** atomically (`FOR UPDATE SKIP LOCKED`)
- Marks them `processing`
- For each job: invokes target sync function with single `ad_account_id`
- Marks `done` on success, increments `attempts` + sets `pending` again on retryable failure, `failed` on permanent failure (token_expired, max attempts)
- Hard exit at 20s — leftover `processing` jobs auto-recover via timeout reset (>2min stuck = back to pending)
- Returns: `{processed, succeeded, failed, remaining}`

**2. Refactor `sync-orchestrator`**
- Instead of looping accounts inline, **enqueues** them into `sync_jobs`
- Skips accounts already pending/processing (idempotent)
- Returns immediately: `{enqueued: N, queue_depth: M}`
- Triggers first worker run via `fetch()` (fire-and-forget) for instant start

**3. Keep `sync-deep-dive` / `sync-fast-lane` unchanged**
- Already accept `ad_account_ids: [single_id]` — no changes needed

### Cron job (via SQL insert tool, not migration)

```sql
SELECT cron.schedule(
  'drain-sync-queue',
  '* * * * *', -- every 1 minute
  $$ SELECT net.http_post(
    url:='https://hhpiimnvkgmpfnldgdhc.supabase.co/functions/v1/sync-queue-worker',
    headers:='{"Content-Type":"application/json","Authorization":"Bearer <anon>"}'::jsonb,
    body:='{}'::jsonb
  ); $$
);
```

Existing Deep-Dive cron (every 30min) keeps running — but now calls orchestrator which only enqueues. Worker drains every minute.

### UI: Sync Health visibility

Add a new card to **Settings → Sync tab** showing:
- Queue depth (pending count)
- Currently processing count
- Failed jobs (last 24h) with retry button
- Avg processing time per job
- "Clear failed" / "Retry all failed" admin actions

### Why this scales to 1000+

| Campaigns | Queue depth | Workers/min | Drain time | API safety |
|-----------|-------------|-------------|------------|------------|
| 150 | 150 | 1 × 10 jobs | ~15 min | ✅ |
| 500 | 500 | 1 × 10 jobs | ~50 min | ✅ |
| 1000 | 1000 | 1 × 10 jobs | ~100 min | ✅ |
| 1000 (bumped) | 1000 | parallel cron at `*/1` × 2 workers × 10 jobs | ~50 min | ✅ |

For 1000+ at faster cadence, simply schedule **2-3 parallel workers** per minute — same code, just more cron entries. No CPU limits ever hit because each worker only handles 10 jobs and exits in ~10s.

### Files touched

**New:**
- `supabase/functions/sync-queue-worker/index.ts`
- Migration: create `sync_jobs` table + RLS + indexes
- SQL insert: cron schedule

**Modified:**
- `supabase/functions/sync-orchestrator/index.ts` — enqueue instead of inline loop
- `supabase/config.toml` — add `[functions.sync-queue-worker] verify_jwt = false`
- `src/components/settings/SyncTab.tsx` — add queue health card

**Untouched:**
- `sync-deep-dive`, `sync-fast-lane` — already single-account capable
- All campaign/metric data logic
- Existing sync_logs (kept for history)

### Build time: ~45 minutes

### Risks & mitigations
- **Risk**: Stuck `processing` jobs if worker crashes mid-batch → **mitigate**: timeout reset query in worker start (`UPDATE sync_jobs SET status='pending' WHERE status='processing' AND started_at < now() - interval '2 minutes'`)
- **Risk**: Duplicate enqueues → **mitigate**: unique partial index on `(ad_account_id, function_name)` for active jobs
- **Risk**: Cron race with manual orchestrator triggers → **mitigate**: `FOR UPDATE SKIP LOCKED` ensures atomic job claims

