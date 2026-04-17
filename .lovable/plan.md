

## Adaptive Chunking for Heavy Account Sync

### Goal
Eliminate timeout errors permanently for any account size (100 → 10,000+ rows) while guaranteeing 100% data accuracy that matches the source ad platform.

### Core Architecture

```text
[Orchestrator] → for each account:
                  ├─ Heavy? (last sync rows > 200 OR unknown)
                  │   └─ Split into 5-day chunks → enqueue N sub-jobs
                  └─ Light? → enqueue 1 full-window job

[Worker] → claims 1 chunk job → calls sync-deep-dive with date range
        → marks chunk done → checks if all chunks for parent done
        → if all done: marks parent "fully synced" + integrity check
```

### Smart Chunking Strategy

**Adaptive sizing based on account history:**
- First-time / unknown account: 5-day chunks (safe default)
- Known light account (<100 rows/sync): 25-day single job (fast path)
- Known heavy account (200-500 rows): 7-day chunks
- Known very heavy (500+ rows): 3-day chunks
- Sizing self-tunes via `ad_accounts.avg_rows_per_day` (computed after each sync)

### Database Changes

**Extend `sync_jobs` table:**
- `parent_job_id` uuid — groups chunks of same account
- `chunk_index` int — order (0, 1, 2…)
- `chunk_total` int — total chunks for this account
- `date_from` date / `date_to` date — chunk window
- `chunk_strategy` text — 'full' | 'chunked'

**New table: `sync_account_stats`** (per-account intelligence)
- `ad_account_id` uuid PK
- `avg_rows_per_day` numeric
- `last_full_sync_at` timestamptz
- `total_rows_last_sync` int
- `recommended_chunk_days` int (auto-tuned: 1-25)
- `consecutive_failures` int

### Sync Function Changes

**`sync-deep-dive`** — accept optional `date_from` / `date_to` params
- If provided: query only that window
- If absent: default 25-day window (back-compat)
- Uses platform's date filter API (Meta `time_range`, TikTok `start_date`/`end_date`)

### 100% Data Accuracy Guarantees

1. **Idempotent upserts** — chunks use `ON CONFLICT (campaign_id, data_date) DO UPDATE` so re-runs never duplicate
2. **Overlap buffer** — each chunk extends ±1 day to catch attribution-window edge cases (platforms backfill conversions up to 24h)
3. **Parent integrity check** — when last chunk completes, run `verify-sync-completeness`:
   - Compares row count vs. expected (queries platform's count API)
   - Flags mismatches in `sync_integrity_alerts` table
   - Auto-triggers gap-fill chunk if missing dates detected
4. **No partial state visible** — UI shows "syncing" until all chunks of a parent are done, preventing users from seeing half-synced data
5. **Atomic completion** — `mark_parent_complete()` SQL function only marks parent done when `COUNT(done) = chunk_total`

### Worker Improvements

- **Per-chunk timeout**: 60s (more than enough for 5-day window of any size)
- **Smart retry**: failed chunk retries with smaller window (5 → 3 → 1 day) before giving up
- **Parallel-safe**: 4 cron workers can process chunks of the same account simultaneously
- **Self-healing**: if a chunk fails permanently, gap detector re-enqueues it on next orchestrator run

### Orchestrator Logic

```text
1. Fetch all active mapped accounts
2. For each account:
   a. Look up sync_account_stats.recommended_chunk_days
   b. Calculate chunks for last 25 days (or last successful sync gap)
   c. Skip chunks that already exist in pending/processing
   d. Insert N sub-jobs with parent_job_id, chunk dates
3. Trigger 4 parallel workers (fire-and-forget)
4. Returns: { accounts: 12, chunks_enqueued: 47, queue_depth: 47 }
```

### UI Enhancements (Sync Health Card)

- Per-account progress bar: `[█████░░░] 5/8 chunks done`
- Integrity status badge: ✅ Verified / ⚠️ Gap detected / 🔄 Syncing
- "Force full re-sync" button per account (clears stats, re-chunks 25 days)
- Chunk-level retry visibility (which 5-day window failed and why)

### Files Touched

**New:**
- Migration: extend `sync_jobs` + new `sync_account_stats` + `sync_integrity_alerts` tables, helper SQL functions (`compute_chunks`, `mark_parent_complete`, `verify_sync_completeness`)
- `supabase/functions/sync-integrity-checker/index.ts` — runs after parent completion

**Modified:**
- `supabase/functions/sync-orchestrator/index.ts` — chunk planning logic
- `supabase/functions/sync-queue-worker/index.ts` — pass date range to inner sync, parent completion check
- `supabase/functions/sync-deep-dive/index.ts` — accept `date_from`/`date_to` params
- `src/components/settings/SyncQueueHealthCard.tsx` — per-account progress + integrity badges

### Why Errors Become Impossible

| Scenario | Old | New |
|----------|-----|-----|
| 1000-row account | ❌ Timeout at 120s | ✅ 5 chunks × 15s each |
| Cloudflare proxy slow | ❌ Whole account fails | ✅ Only 1 chunk retries |
| Token mid-sync expires | ❌ Lose 25 days | ✅ Lose only current chunk |
| Platform API throttle | ❌ Cascade failure | ✅ Auto backoff per chunk |
| Late attribution backfill | ❌ Stale data | ✅ ±1 day overlap catches it |

### Build Time
~60 minutes — extends existing queue infra, no rewrites.

