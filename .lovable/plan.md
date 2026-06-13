# Sync UI: Self-Healing Deep-Dive Visuals

The backend now has: always-chunked deep dives, `deep_dive_backlog` queue, auto-shrink on `cpu_timeout`/`proxy_upstream`, transient 546 retry, and learning chunk sizes. The UI still shows the old "Critical / never" model and doesn't expose backlog or self-healing. This plan upgrades the Sync tab so the new behavior is visible and trustworthy.

## What the user will see

1. **New top banner — "Self-Healing Deep Dive engine"** (replaces the static "Live chunk-aware sync engine" subtitle in `SyncPulseCard`). Subtle gradient pill with three live mini-stats:
   - `Chunks in flight: N`
   - `Backlog: N days pending` (links to filter)
   - `Auto-shrunk in 24h: N` (count of jobs that hit `cpu_timeout`/`proxy_upstream` and got split)

2. **Account Health Matrix — new "Engine" column** (between Deep-Dive and Activity):
   - Current chunk size for the account (e.g. `Chunks: 1d`, `3d`, `7d`)
   - Backlog count badge if `backlog_days > 0` (amber, "N day(s) queued")
   - `Self-healing` green badge when the account auto-recovered (had ≥1 split in 24h AND last parent succeeded)
   - Tooltip explains: "TikTok heavy account — collapsed to 1-day windows. 4 days in backlog, next retry in 12m."

3. **Row expand panel — new "Self-Heal Timeline" section** under Deep-Dive stats:
   - `Window size: 1d` (with arrow showing previous → current if shrunk)
   - `Splits (24h): 3` · `Backlog days: 4` · `Next backlog retry: 12m`
   - List of last 3 backlog entries: `2026-06-10 · attempt 2/5 · next in 12m`
   - `Drain backlog now` button → invokes orchestrator with `drainBacklog: true`

4. **New filter chip** in matrix: `Backlog (N)` between "Silent / Skipped" and "Idle". Shows only accounts with `backlog_days > 0`.

5. **Errors & Retry panel updates**:
   - `cpu_timeout` and `proxy_upstream` badges get a small "↻ auto-split" suffix when the worker successfully created child chunks. Communicates "this error was handled" instead of looking like pure failure.
   - New collapsible sub-section: **Backlog (N)** listing single-day backlog rows with `account · date · attempts · next_retry_at` and a per-row "Retry now" button.

6. **Status pill rewording**: `Error cpu_timeout` → `Auto-splitting (cpu_timeout)` when the row also has a successful child within the last hour. Removes the false-alarm red on HEPT 15.

## Technical details

**Data layer (`SyncTab.tsx`)**
- Add parallel query: `supabase.from("deep_dive_backlog").select("ad_account_id, date, attempts, next_retry_at, last_error").order("next_retry_at")`.
- Aggregate into `backlogByAccount: Map<string, { count, nextRetryAt, entries[] }>`.
- Add 24h aggregate query for auto-split count: `sync_jobs` where `error_code in ('cpu_timeout','proxy_upstream')` AND has child jobs (parent_job_id IS NOT NULL on a sibling) — compute client-side from existing `allJobs24hRes`.
- Extend `AccountHealth` with: `backlog_count`, `backlog_next_retry_at`, `backlog_entries`, `current_chunk_days`, `splits_24h`, `self_healed`.

**Components**
- `SyncPulseCard.tsx`: new `EngineBanner` sub-component receiving `{ chunksInFlight, backlogTotal, autoShrunk24h }`.
- `SyncHealthRow.tsx`: 
  - Add `EnginePill` between Deep-Dive and Activity (chunk size + backlog badge + self-healing badge).
  - Expanded panel: new `SelfHealTimeline` section.
  - Status pill: derive `Auto-splitting` label when `splits_24h > 0 && deep.tier !== 'critical'`.
- `SyncHealthMatrix.tsx`: add `backlog` filter, update grid template `col-span-2/2/3/2/3/...` to fit Engine column (collapse Activity to col-span-2, Engine col-span-2).
- `SyncErrorPanel.tsx`: add Backlog sub-section + `auto-split` suffix badge.

**Backend wiring (no schema change)**
- `deep_dive_backlog` table already exists from the prior migration. Add SELECT GRANT for `authenticated` if missing (check first; add migration only if missing).
- `sync-orchestrator` already accepts a drain path; expose a small "Retry now" action by invoking with `{ function: 'sync-deep-dive', ad_account_id, date }`.

## Out of scope
- No edge function logic changes (engine already implemented).
- No schema redesign.
- No Fast-Lane visual changes.
- No Manual Sync / Sync Schedule changes.

## Files to edit
- `src/components/settings/SyncTab.tsx` (queries + aggregation)
- `src/components/settings/sync/SyncPulseCard.tsx` (engine banner)
- `src/components/settings/sync/SyncHealthRow.tsx` (Engine pill + Self-Heal Timeline)
- `src/components/settings/sync/SyncHealthMatrix.tsx` (column + filter)
- `src/components/settings/sync/SyncErrorPanel.tsx` (backlog section + auto-split suffix)
- Possibly one tiny migration to GRANT SELECT on `deep_dive_backlog` to `authenticated` (only if the prior migration omitted it).

## Validation
- HEPT 15 row should show `Engine: 1d · Backlog 4 · Self-healing` instead of `Critical / never`.
- Top banner should show non-zero `Auto-shrunk` and `Backlog` numbers.
- Errors panel `cpu_timeout` rows for HEPT 15 should carry the `↻ auto-split` suffix.
- Light accounts (FARISH, HEPT 8) keep `Engine: 7d · No backlog` and stay green.
