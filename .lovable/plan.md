## Goal
Replace the spinner-only "Deep Dive Sync" button on the client Spend tab with a real progress bar driven by actual `sync_jobs` rows in the database — no fake/demo animation.

## How it works

1. **Capture sync scope on click**
   - When the user clicks Deep Dive Sync in `src/pages/ClientDetail.tsx`, record:
     - `syncStartedAt` (ISO timestamp, just before invoking orchestrator)
     - `syncAccountIds` (the client's mapped `ad_account_id`s)
   - Invoke `sync-orchestrator` as today. Read `enqueued` from the response as the initial `total`.

2. **Track real progress from `sync_jobs`**
   - Open a Supabase Realtime channel on the `sync_jobs` table filtered to `function_name = 'sync-deep-dive'` and rows belonging to `syncAccountIds` created at/after `syncStartedAt`.
   - On every INSERT/UPDATE, recompute counts from a local map keyed by job id: `total`, `done`, `failed`, `processing`, `pending`.
   - Also run a single initial `SELECT` to seed the map (covers jobs already inserted before the channel subscribed).
   - As a safety net, poll the same query every 4s while syncing (in case realtime is delayed).

3. **UI**
   - Below the button (or inline next to it), show a `Progress` bar (`@/components/ui/progress`) with:
     - Value = `done / total * 100` (0 if total = 0)
     - Label: `Syncing {done}/{total} jobs · {processing} running` (and `{failed} failed` if any)
     - Once complete (`done + failed === total` and `total > 0`), show "Sync complete" briefly then hide.
   - Button stays disabled while `syncing === true`.
   - On completion, call `reloadSpendData()` automatically.

4. **State & cleanup**
   - New state: `syncProgress` = `{ active, total, done, failed, processing, pending, jobsById }`
   - Cleanup: unsubscribe channel + clear poll interval when complete, on unmount, or after a 5-minute hard timeout (mark as "Sync timed out — partial data may have loaded" and stop tracking).

5. **No backend changes required**
   - `sync-orchestrator` already returns `enqueued` and writes parent/child jobs to `sync_jobs`.
   - `sync_jobs` RLS already allows admin/org reads (the user opening Client Detail is an admin/manager).
   - No edge function edits, no migrations.

## Files to change

- `src/pages/ClientDetail.tsx`
  - Add `syncProgress` state and helpers (init, refresh-from-rows, subscribe, cleanup).
  - Update `handleClientDeepDiveSync` to set scope, subscribe to realtime + start polling, and remove the fixed 2.5s `setTimeout` reload.
  - Render a `<Progress>` row beneath the Deep Dive Sync button in the Spend tab when `syncProgress.active`.

## Out of scope
- No changes to `sync-orchestrator`, `sync-deep-dive`, `sync-queue-worker`, or `sync_jobs` schema.
- No change to fast-lane or global admin syncs.
- No change to the rest of the Spend tab layout.

## Verification
1. Open a client → Spend tab → click Deep Dive Sync.
2. Progress bar appears with `0/{N}` and increments as workers finish each chunk (visible within seconds via realtime).
3. `failed` count appears if a chunk errors.
4. On completion, bar shows "Sync complete", then disappears; spend table reloads with fresh rows.
5. Navigate away mid-sync → no console errors (channel/interval cleaned up).
6. If realtime is disabled, the 4s poll still drives the bar forward.
