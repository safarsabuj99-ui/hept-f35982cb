## Goal

Shrink all automatic backfill windows to **7 days** for both Fast-Lane and Deep-Dive, keep Manual Sync at **30 days** for on-demand recovery, and preserve all existing self-healing safety nets so heavy TikTok accounts (HEPT 15, HEPT AGENCY 2) stop returning `api_error`.

## What you will see

- **Account Health Matrix** Engine pill reads `7d` (was `10d` / `25d`).
- **HEPT 15 / HEPT AGENCY 2** Deep-Dive completes without `api_error` — smaller window = lighter TikTok payload.
- **Manual Sync** button pulls the **last 30 days** for the chosen account so you can recover historical gaps on demand.
- **Fast-Lane** runs frequently and now refreshes the last 7 days each cycle (was 10).
- Auto-split, backlog drain, retry helpers, and stale-error reset all stay in place — just operating on a 7-day budget.

## Technical changes

### 1. Window constant: 10 → 7 (both lanes)

- `supabase/functions/sync-orchestrator/index.ts`
  - `TOTAL_WINDOW_DAYS = 7`.
  - Deep-Dive Meta/Google chunk cap: `Math.min(stat?.recommended_chunk_days ?? 5, 7)` (a single chunk usually covers the full window).
  - TikTok adaptive chunking stays `3 → 2 → 1` based on `consecutive_failures` (a 7-day window splits into 3 chunks at worst).
- `supabase/functions/sync-fast-lane/index.ts`
  - Replace the unified 10-day window (`today - 9 → today`) with a **7-day rolling window** (`today - 6 → today`) across Meta, TikTok, Google.
- `supabase/migrations/<new>.sql`
  - Update `mark_parent_complete` constants `10.0` / `10` → `7.0` / `7` so `avg_rows_per_day` and recommended chunk size align with the new window.

### 2. Manual Sync = 30 days (independent of auto window)

- `supabase/functions/sync-deep-dive/index.ts` and `sync-fast-lane/index.ts`
  - Accept optional `{ manual: true, lookback_days?: number }` in the request body. When present, override the 7-day rolling window with the requested range (default 30).
- `src/components/settings/SyncTab.tsx` (and any per-account "Manual Sync" trigger)
  - Pass `{ manual: true, lookback_days: 30 }` when the user clicks Manual Sync.
  - Tooltip / helper text: "Pulls last 30 days for this account".

### 3. UI label updates

- `src/components/settings/sync/SyncHealthRow.tsx` — Engine pill displays `7d` (drop any `?? 10` / `?? 25` fallback, source from a shared constant).
- `src/components/settings/sync/SyncControlsAccordion.tsx` — copy: "7-day rolling backfill · Manual sync covers 30 days".
- `.lovable/plan.md` — historical note updated from 10 → 7.

### 4. Safety nets (unchanged, just verified)

- `deep_dive_backlog.lane` column drives Fast-Lane vs Deep-Dive backlog separation.
- Fast-Lane per-chunk isolation, `tiktokFetchWithRetry`, 8-page pagination cap, backlog spill.
- `sync-queue-worker` auto-split on `cpu_timeout` / `proxy_upstream` / `api_error` (down to 1-day chunks).
- Stale `sync_account_stats.last_error` reset on next successful Fast-Lane.

## Out of scope

- No changes to Meta/Google attribution, mapping, finance, or RLS logic.
- No new tables or cron changes.
- No changes to worker concurrency.

## Files

- `supabase/migrations/<new>.sql` — `mark_parent_complete` constants 10 → 7.
- `supabase/functions/sync-orchestrator/index.ts` — `TOTAL_WINDOW_DAYS = 7`, chunk cap adjustments.
- `supabase/functions/sync-fast-lane/index.ts` — 7-day window, accept `manual` + `lookback_days` override.
- `supabase/functions/sync-deep-dive/index.ts` — accept `manual` + `lookback_days` override.
- `src/components/settings/SyncTab.tsx` — Manual Sync invocation passes 30-day flag.
- `src/components/settings/sync/SyncHealthRow.tsx` — Engine pill `7d`.
- `src/components/settings/sync/SyncControlsAccordion.tsx` — copy update.

## Validation

- Engine pill reads `7d` everywhere; no `10d` / `25d` strings remain.
- HEPT 15 next Deep-Dive cycle: succeeds without `api_error`; if any chunk fails, auto-split shrinks to 1-day and backlog drains within 1–2 cycles.
- Clicking Manual Sync on any account triggers a 30-day pull (verify in `sync_jobs.date_from` / `date_to`).
- `daily_metrics` has rows for every day in the last 7 days for all active mapped accounts.
- Fast-Lane payload size drops ~30% vs current 10-day window.
