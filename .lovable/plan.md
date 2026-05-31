
# Deep-Dive: Zero Data Loss + Zero CPU Timeout

## Why it times out today

The infrastructure (queue, chunking, auto-split, demotion) is already solid. The CPU is burned **inside `sync-deep-dive/index.ts`** on three hot paths:

1. **Per-row sequential awaits.** For every insight row we do *4* DB round-trips in series:
   `upsertCampaign` (SELECT + UPDATE/INSERT) → `campaign_mappings.upsert` → `daily_metrics.upsert` → `campaign_performance.upsert`.
   500 rows = **2,000 sequential awaits** + 2,000 JSON serializations. The 2-second CPU budget evaporates long before the 150s wall-clock.
2. **Large JSON payload parsing.** Meta `insights` and TikTok `report/integrated` pages of 500 rows with nested `actions[]` are parsed in one shot inside the request handler.
3. **No mid-flight checkpointing.** If the function dies, the chunk is retried from zero — same rows re-parsed, same CPU re-spent.

The queue worker's `auto-split on cpu_timeout` is a safety net, not a solution: it still loses time and re-runs work already done.

---

## The fix — three coordinated changes

### 1. Batched bulk upserts (kills 90% of CPU usage)

Collect rows in memory, then write in chunks of 200 per table:

```ts
// instead of awaiting per-row…
const campaignRows: any[] = [];
const metricsRows: any[] = [];
const mappingRows: any[] = [];
const perfRows: any[] = [];

for (const row of allInsights) { /* push to arrays, no awaits */ }

// flush in 200-row pages, in parallel across tables
await Promise.all([
  flush("campaigns", campaignRows, "platform_id"),
  flush("daily_metrics", metricsRows, "campaign_id,data_date"),
  flush("campaign_mappings", mappingRows, "campaign_id"),
  flush("campaign_performance", perfRows, "campaign_id,date"),
]);
```

This turns ~2,000 awaits into ~10 awaits per chunk. CPU drops from seconds to ~150ms.

**Guard-lock handling:** pre-load `guardLockedIds` and `existing campaigns` for this account *once* at the top, build a Map keyed by `platform_id`, and resolve `final status` in-memory before the bulk upsert (no per-row SELECT).

### 2. Drop the legacy double-write (immediate -50% CPU)

Every row is written to **both** `daily_metrics` AND `campaign_performance`. The app already reads from `daily_metrics` (see `fetchAllRows.ts` example and dashboards). Stop the dual write: keep `daily_metrics` only, behind a feature flag `enable_legacy_perf_write=false` in `settings`. Backward-compat reads (if any remain) can be migrated later in a separate pass.

### 3. Tighter per-chunk default + entity-level micro-chunking

In `sync-orchestrator/index.ts`:
- Lower default `chunkDays` from `5` → `3` for accounts without stats (currently `?? 5`).
- Lower `compute_chunk_days` SQL thresholds one tier (anything ≥20 rows/day → 3 days).

In `sync-queue-worker/index.ts`:
- `shrinkWindow` already exists. Add a **second axis**: when a chunk still times out at 1 day, split by **entity slice** (campaign_id ranges) instead of giving up. Add a `campaign_offset` + `campaign_limit` to the job row; `sync-deep-dive` filters insights to only those campaign IDs.

### 4. Checkpoint inside `sync-deep-dive`

After each successful 200-row bulk flush, update the job row:
```ts
await supabase.from("sync_jobs").update({
  rows_synced: (job.rows_synced ?? 0) + flushed,
  last_progress_at: new Date().toISOString(),
}).eq("id", job.id);
```
If the function dies mid-chunk, the worker's recovery logic sees the partial `rows_synced` and the next retry only does the *remaining* date range (we track `cursor_date` on the job row).

---

## Database changes

```sql
ALTER TABLE public.sync_jobs
  ADD COLUMN IF NOT EXISTS cursor_date date,
  ADD COLUMN IF NOT EXISTS campaign_offset integer,
  ADD COLUMN IF NOT EXISTS campaign_limit integer,
  ADD COLUMN IF NOT EXISTS last_progress_at timestamptz;

INSERT INTO public.settings(key, value)
VALUES ('enable_legacy_perf_write','false')
ON CONFLICT (key) DO NOTHING;
```

Tune `compute_chunk_days` thresholds (3/5/10/25 → 1/3/5/15).

---

## Files touched

| File | Change |
|---|---|
| `supabase/functions/sync-deep-dive/index.ts` | Bulk-upsert refactor (Meta + TikTok + Google paths), preload guard-lock map, drop legacy `campaign_performance` writes behind flag, write `cursor_date` checkpoints, accept `campaign_offset/limit` to filter rows |
| `supabase/functions/sync-queue-worker/index.ts` | After date-shrink hits 1-day, fall back to campaign-slice splitting (2 sub-jobs each with half the campaigns) |
| `supabase/functions/sync-orchestrator/index.ts` | Default `chunkDays` 5→3; raise `PARALLEL_WORKER_TRIGGERS` 4→6 |
| `supabase/migrations/<new>` | New columns + setting + updated `compute_chunk_days` |

No frontend changes. No data migration. RLS untouched.

---

## Why this hits 100% data capture

- **No row is skipped:** bulk upserts use the same `onConflict` keys; idempotent.
- **No chunk is abandoned:** date-shrink → campaign-slice → finally `failed` only when *both axes* exhausted (extremely rare).
- **No mid-chunk loss:** `cursor_date` lets a killed function resume from the last fully flushed day.
- **No silent drift:** `mark_parent_complete` still aggregates, `sync_integrity_alerts` still fires on any failed sibling.

---

## Validation

1. Pick the heaviest account (highest `total_rows_last_sync`) and force-enqueue a 25-day Deep-Dive.
2. Watch `sync-deep-dive` edge logs: per-invocation CPU should report `<500ms` (was hitting 2,000ms).
3. `select rows_synced, status from sync_jobs where parent_job_id = '<id>'` — every chunk `done`, sum of `rows_synced` ≥ previous best run.
4. Spot-check `daily_metrics` for `data_date` continuity (no gaps) over the 25-day window.

Shall I proceed with the migration + refactor?
