## Problem

Meta deep-dive jobs actually fetch and write data successfully (verified in DB: today's `daily_metrics` for Meta accounts is up-to-date as of 10 minutes ago). But every Meta deep-dive job reports `rows_synced = 1` — making the UI (progress bar / "Sync complete" toast) and stats appear as if Meta returned **no data**.

### Root cause

In `supabase/functions/sync-deep-dive/index.ts`, the counters `apiRowsFetched` and `metricRowsWritten` are **only incremented inside the TikTok branch** (lines 1278-1279):

```ts
apiRowsFetched += rows.length;
metricRowsWritten += prepared.length;
```

The Meta branch (ends ~line 704) and Google branch never touch these counters. The function then returns:

```ts
synced: metricRowsWritten,       // always 0 for Meta/Google
rows_written: metricRowsWritten, // always 0 for Meta/Google
```

`sync-queue-worker` reads `data.synced || data.accounts_synced || 0`, so it falls back to `accounts_synced = 1` and stores `rows_synced = 1` on every Meta job. That misreports progress AND feeds the wrong `total_rows_last_sync` into `mark_parent_complete`, which then sets a too-aggressive `recommended_chunk_days` (treats account as low-volume).

## Fix

In `supabase/functions/sync-deep-dive/index.ts`:

1. **Meta branch** — after the `daily_metrics` bulk upsert succeeds (around line 682), add:
   ```ts
   apiRowsFetched += allInsights.length;
   metricRowsWritten += metaPrepared.length;
   ```
   And track skipped-but-fetched campaigns (rows returned by Meta whose campaign name didn't match any keyword) into the existing `skippedCampaigns` — already handled by `resolveClientId` returning null.

2. **Google branch** — same treatment: after writing metrics, increment `apiRowsFetched += <raw row count>` and `metricRowsWritten += <prepared.length>`.

3. **Meta "mapping miss" visibility** — mirror TikTok's behavior (lines 1281-1294): when `allInsights.length > 0` but `metaPrepared.length === 0`, insert a `sync_logs` row with `error_code: "mapping_miss"` and a clear message naming the account + date range so admins know why nothing was written.

No changes to Meta API URLs, field lists, or the orchestrator. No DB migration.

## Verification

1. Trigger a Deep Dive Sync on a client whose accounts are Meta-only.
2. Check `sync_jobs.rows_synced` for the resulting rows → should equal the real Meta `daily_metrics` count for that chunk, not `1`.
3. Confirm the client Spend page progress bar shows the correct "Sync complete" totals.
4. Verify `daily_metrics` for that client still updates (regression check).
5. If a Meta account has 0 keyword matches, confirm a `mapping_miss` row appears in `sync_logs`.

## Files to change

- `supabase/functions/sync-deep-dive/index.ts` — Meta + Google branches only.

## Out of scope

- No changes to fast-lane, orchestrator, worker, or DB schema.
- No changes to Meta API field selection or attribution logic.
- TikTok HTTP 546 failures on `HEPT AGENCY 2` are a separate, pre-existing CPU-limit issue — not part of this fix.
