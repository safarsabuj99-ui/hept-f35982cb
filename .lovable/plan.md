# Fast-Lane Hardening + 10-Day Backfill (Both Lanes)

The screenshot shows two leftover issues:
1. **Fast-Lane throws `api_error`** on heavy TikTok accounts (HEPT 15, HEPT AGENCY) — the self-healing engine only covers Deep-Dive today.
2. **Backfill is still 25 days** (`TOTAL_WINDOW_DAYS = 25`, UI shows `25d windows`). User wants **10 days for both Fast-Lane and Deep-Dive**.

This plan narrows both windows to 10 days and extends the self-healing model to Fast-Lane so heavy accounts stop producing red `api_error` pills.

## What the user will see

- Account Health Matrix: `Engine: 10d` instead of `25d windows`. Heavy accounts auto-shrink to `3d` / `1d` under load — same self-healing badges that exist for Deep-Dive.
- HEPT 15 / HEPT AGENCY: Fast-Lane status changes from `Error api_error` to `Auto-recovering (api_error)` while the engine retries with smaller chunks, then clears to `Live` once a child chunk succeeds.
- Self-Heal Timeline lists **both Fast-Lane and Deep-Dive** backlog days.
- Top banner copy: `Backlog: N days pending` covers both lanes.

## Technical changes

### 1. Backfill window: 25 → 10 days (both lanes)

- `supabase/functions/sync-orchestrator/index.ts`:
  - `TOTAL_WINDOW_DAYS = 10` — used for **Deep-Dive** chunk planning.
  - Default `recommended_chunk_days` for Meta/Google deep-dive: `5` (so one or two chunks cover the 10-day window). TikTok deep-dive cap stays at `3 → 2 → 1` based on `consecutive_failures`.
- `supabase/functions/sync-fast-lane/index.ts`:
  - Replace the per-platform start dates (TikTok/Google use `globalStartDate → today`; Meta uses last 3 days) with **a unified 10-day rolling window** (`today - 9 → today`) across Meta, TikTok, Google. Historical pre-10-day backfill is Deep-Dive's job.
- `supabase/migrations/<new>.sql`:
  - Update `mark_parent_complete` constants from `25.0` / `25` to `10.0` / `10` so `avg_rows_per_day` and `recommended_chunk_days` reflect the new window.
- UI: remove the hardcoded `25` fallback in `SyncHealthRow.tsx` (line 387) and update the "25+ fields" copy in `SyncControlsAccordion.tsx`. Display the actual `current_chunk_days` or `—` when null.

### 2. Fast-Lane self-healing (mirrors Deep-Dive engine)

TikTok Fast-Lane is the main offender. Apply the same auto-shrink + backlog pipeline:

- `sync-fast-lane/index.ts`:
  - **Per-chunk failure isolation**: today's `tiktokFailed = true; break` aborts the whole account. Change to per-chunk: failed chunks get pushed into `deep_dive_backlog` with `lane = 'fast'` so the orchestrator can drain them.
  - **Hardened retry**: reuse Deep-Dive's `tiktokFetchWithRetry` (handles 5xx/546/empty body/JSON parse) for the report calls.
  - **Page cap**: cap TikTok pagination at 8 pages per chunk; on overflow, split the chunk and spill the remainder to backlog.
  - **Error code propagation**: when a chunk was auto-split successfully, return `error_code: 'auto_split'` instead of `api_error`.

- **Migration**: add `lane text not null default 'deep' check (lane in ('fast','deep'))` column to `deep_dive_backlog`. Orchestrator's drain block filters by `lane` matching the current run.

- `sync-orchestrator/index.ts`:
  - Add the same backlog-drain block at the top of the `isFastLane` branch (currently only `isDeepDive` drains).
  - When enqueueing fresh fast-lane jobs after a failure, set `chunk_strategy = 'chunked'` so the worker uses `shrinkWindow` on the next failure.

- `sync-queue-worker/index.ts`:
  - Extend the `cpu_timeout`/`proxy_upstream` auto-split path to also fire for `api_error` on Fast-Lane when the failure window is > 1 day. Successful split → don't mark parent as failed; queue child days into backlog with `lane = 'fast'`.

### 3. Status pill rewording for Fast-Lane

- `SyncHealthRow.tsx`: extend the existing `Auto-splitting` relabel to Fast-Lane:
  - `fast.tier === 'critical' && splits_24h > 0` → `Auto-recovering (Fast-Lane)` (amber, not red).
  - `fast.tier === 'critical' && backlog_count > 0` → `Backlog draining (Fast-Lane)`.
- `SyncErrorPanel.tsx`: add the `↻ auto-split` suffix for Fast-Lane jobs with `error_code in ('cpu_timeout','proxy_upstream','api_error')` when a child sibling exists.

### 4. Data layer

- `SyncTab.tsx`: split `backlog_entries` by `lane` and surface both counts (`fast_backlog`, `deep_backlog`) on `AccountHealth`. Engine pill shows the worst of the two.

## Out of scope

- No changes to Meta / Google attribution logic.
- No new edge functions.
- No changes to Manual Sync or Sync Schedule UI.

## Files

- `supabase/migrations/<new>.sql` — add `lane` column to `deep_dive_backlog`; rewrite `mark_parent_complete` window constants 25 → 10.
- `supabase/functions/sync-orchestrator/index.ts` — `TOTAL_WINDOW_DAYS = 10`, Fast-Lane backlog drain.
- `supabase/functions/sync-fast-lane/index.ts` — unified 10-day window, per-chunk isolation, retry helper, page cap, backlog spill.
- `supabase/functions/sync-queue-worker/index.ts` — auto-split for Fast-Lane api_error.
- `src/components/settings/SyncTab.tsx` — split backlog by lane.
- `src/components/settings/sync/SyncHealthRow.tsx` — drop `?? 25` fallback, Fast-Lane Auto-recovering pill.
- `src/components/settings/sync/SyncErrorPanel.tsx` — Fast-Lane auto-split suffix.
- `src/components/settings/sync/SyncControlsAccordion.tsx` — copy update.

## Validation

- HEPT 15 Fast-Lane: previous `Critical 35% · api_error` → `Auto-recovering · 3d windows · Backlog 2 days`, clears to `Live` after backlog drains.
- Engine column reads `10d` for healthy accounts, `3d`/`1d` for heavy ones.
- No row shows the literal string `25d` anywhere.
- Deep-Dive only fetches a 10-day rolling window; older days only re-enter via explicit backlog or manual sync.
- Errors panel `api_error` rows on TikTok carry `↻ auto-split` suffix and are no longer red.
