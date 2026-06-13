## Goal
Make deep-dive sync collect 100% of API data for every account — including heavy ones like HEPT 15 and HEPT AGENCY 2 — with zero "cpu_timeout / HTTP 546 / empty JSON" losses.

## Why today fails
Deep-dive runs one big job per account. Heavy TikTok accounts blow the 90 s worker budget and the Cloudflare proxy's 140 s budget. When that happens the job dies, `mark_parent_complete` resets `consecutive_failures` to 0, and the orchestrator launches the same oversized job again on the next tick — an infinite-loss loop.

## Proposed model: "Always-Chunked, Self-Healing Deep Dive"

Three principles:
1. **Never run a deep-dive as one big job.** Every deep-dive is a parent + day-window children, even for "small" accounts. Children are tiny (1–7 days) so no single child can exceed the timeout.
2. **Failure is data, not loss.** A child that fails is retried with a smaller window (7→3→1 day). A 1-day child that still fails goes into a `deep_dive_backlog` queue and is retried on the next orchestrator tick — the parent still completes for the days that succeeded, so good data lands immediately.
3. **The account's chunk size learns from reality.** Chunk size is driven by the *slowest successful window in the last 7 days*, not by `avg_rows_per_day`. Heavy accounts naturally settle at 1-day chunks; light accounts stay at 25.

### Architecture

```text
sync-orchestrator
   │  (always builds chunks; no "full" path)
   ▼
sync_jobs (parent + N children, 1–7 day windows)
   │
   ▼
sync-queue-worker  ── child OK ──▶ done
   │                                 │
   │                                 ▼
   │                          mark_parent_complete
   │                          (only resets failures
   │                           on a real successful
   │                           chunked completion)
   │
   └── child FAIL ──▶ shrink window 7→3→1
                     └─ 1-day still fails ──▶ deep_dive_backlog
                                              (retried next tick,
                                               escalating backoff)
```

### Concrete changes

**1. `sync-orchestrator/index.ts`**
- Remove the "non-chunked / full" branch entirely. Every deep-dive becomes a chunked parent.
- Choose chunk size from a new helper `pick_chunk_days(account)`:
  - TikTok: cap at **3 days** max, **1 day** if any failure in last 7d.
  - Meta/Google: 7 days default, 3 if failures, 1 if repeated failures.
- Cap concurrent in-flight children per account at 3 to avoid rate-limit spirals.

**2. `sync-queue-worker/index.ts`**
- Raise `PER_JOB_TIMEOUT_MS` to **120 s** for deep-dive only (worker hard limit stays 140 s).
- Classify `HTTP 546` and "Unexpected end of JSON input" as `proxy_upstream` (transient, not permanent) so they reschedule instead of failing.
- Auto-split already exists for `cpu_timeout` — extend it to also trigger on `proxy_upstream`.
- When a 1-day chunk fails after all retries, insert it into `deep_dive_backlog` (new table) instead of marking the parent failed.

**3. `mark_parent_complete` SQL function**
- Stop zeroing `consecutive_failures` on non-chunked runs (the bug that hides failing accounts).
- Only reset when a chunked parent finishes with ≥95 % child success.

**4. New table: `deep_dive_backlog`**
```text
id, ad_account_id, org_id, date, attempts, last_error,
next_retry_at, created_at
```
Tiny single-day units the orchestrator drains first on every tick, with exponential backoff (1 m → 5 m → 30 m → 2 h → 6 h, capped). Once a row succeeds, it's deleted. Visible in Sync Health UI as "Backlog: N days pending".

**5. `sync-deep-dive/index.ts` (TikTok branch only)**
- Hard-cap the pagination loop at **8 pages** per chunk (more = window too wide, will be auto-split).
- Treat empty body + non-2xx from the US Cloudflare Worker as `proxy_upstream` with a clean error message.
- Add a 5 s retry-once on the *first* 546 inside a chunk (cheap recovery for transient proxy hiccups).

**6. `SyncHealthMatrix.tsx`**
- New column: **Backlog** (count of pending days in `deep_dive_backlog` per account).
- New badge: **Self-healing** when an account currently has children at 1-day windows.
- Existing health score already covers fast/deep lanes — no changes needed there.

### What this guarantees
- **No silent data loss.** Every day either lands in `daily_metrics` or sits visibly in `deep_dive_backlog`.
- **No runaway loops.** Failed accounts back off automatically and re-attempt only what's still missing.
- **No manual babysitting.** HEPT 15 and HEPT AGENCY 2 will drop to 1-day chunks within one tick and start filling in from there.
- **No cost spike.** Total API calls per day are similar — same date range, just split. Failed days only retry the failed day, not the full range.

### Out of scope
- Schema for `campaigns` / `daily_metrics` (unchanged).
- Fast-lane (already healthy).
- TikTok proxy worker code (untouched — we work around its 140 s limit).
- New raw-landing table.

### Files touched
- `supabase/functions/sync-orchestrator/index.ts`
- `supabase/functions/sync-queue-worker/index.ts`
- `supabase/functions/sync-deep-dive/index.ts`
- New migration: `deep_dive_backlog` table + GRANTs + RLS + small index
- Updated SQL function: `mark_parent_complete`
- `src/components/settings/sync/SyncHealthMatrix.tsx` (+ a tiny query in `SyncTab.tsx`)
- Memory updates: `mem://features/sync/operational-management`, `mem://architecture/tiktok-proxy-egress-strategy`

### Validation
1. Trigger deep-dive for HEPT 15 → confirm it spawns ~10 one-day children, not one big job.
2. Confirm any child that 546s gets a single 5 s retry, then either succeeds or auto-splits / lands in backlog.
3. After one orchestrator tick, `sync_account_stats.consecutive_failures` reflects reality (not 0).
4. After two ticks, backlog for HEPT 15 trends to 0 and `daily_metrics` for the target range is complete.
5. Light accounts (e.g. a Meta account) still finish in one tick at 7-day chunks — no regression.
