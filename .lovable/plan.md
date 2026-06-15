# Fix TikTok auto-sync (fast-lane + deep-dive)

## What's actually happening

The cron + queue ARE working. Both fast-lane and deep-dive ran every 15 min today and all jobs are `status: done`. The reasons you see no new TikTok data:

1. **Deep-dive: 40002 invalid metric error.** TikTok now rejects `total_add_to_cart`, `total_initiate_checkout`, `total_complete_payment` in the BC reporting endpoint. Our `BC_METRICS_B` list in `sync-deep-dive/index.ts:863` still requests them, so the primary call fails and the split-metric fallback returns 0 rows for the whole window.
2. **Orchestrator silently skips "quiet" accounts.** `sync-orchestrator/index.ts:127` uses `ZERO_RUN_GRACE = 3`. After 3 consecutive zero-row fast-lane runs an account is downgraded to a ~2-hour heartbeat. HEPT 18 (38 zero runs) and HEPT Agency 5 (137 zero runs) are stuck in that mode, so deep-dive barely fires for them.
3. **HEPT Agency 5 has 0 campaign mappings.** Ingestion policy filters out everything without an active mapping → "campaigns found: 0" forever, no matter how many syncs we run.
4. **HEPT 18 has 17 active mappings** but TikTok status fetch still returns 0 campaigns — the `original_name_tag` keywords no longer match live TikTok campaign names.

Tokens are valid (both expire 2027, `connection_status=active`). No auth problem.

## Changes

### 1. `supabase/functions/sync-deep-dive/index.ts`
- Remove the 3 rejected metrics from `BC_METRICS_B` (line 863). Keep them in the row-parser fallback (lines 1142-1144) so old payloads still parse if TikTok ever re-enables them.
- Replace with TikTok's currently-supported equivalents from the **Advertiser** reporting endpoint: `complete_payment`, `add_to_cart`, `initiate_checkout`, `complete_payment_roas` (these still work; the `total_*` variants are BC-only and were deprecated).
- Add a one-time log line when a 40002 is still hit, including the exact field list returned by TikTok, so we can react quickly next time TikTok deprecates fields.

### 2. `supabase/functions/sync-orchestrator/index.ts`
- Raise `ZERO_RUN_GRACE` from `3` → `12` (≈3 hours of cycles before downgrading).
- Add a hard override: if `platform = tiktok` AND the account has any active `campaign_mappings`, never apply the skip gate to deep-dive — always queue it on the normal cadence. This guarantees TikTok deep-dive keeps trying even after a streak of zero rows.
- Keep fast-lane gating untouched (cheap enough to always run anyway).

### 3. Empty/stale mapping visibility (no schema change)
- In the orchestrator, when an account is skipped because it has 0 active mappings, write a row into `sync_logs` with `error_code='no_mappings'` and a clear message naming the account. This makes the real reason show up in the Sync ops UI instead of looking like a silent failure.
- No code change to the mapping UI — you'll see the row appear in the existing logs panel and can fix the mapping there.

### 4. Manual one-time backfill after deploy
After the deploy, trigger one targeted deep-dive run for HEPT Agency 2 + the other 5 accounts that already have mappings, lookback 7 days, to repopulate the window that returned 0 rows today. (Curl loop, same shape as before, no code change.)

## Out of scope

- Adding mappings for HEPT Agency 5 — that's a manual data step in the mapping UI; I'll surface the missing-mapping log so you can act.
- Re-tagging HEPT 18 keywords — same; needs human review against current TikTok campaign names.
- Cloudflare proxy or token rotation — both are healthy.

## Verification

1. Re-deploy `sync-deep-dive` + `sync-orchestrator`.
2. Trigger one manual deep-dive on HEPT Agency 2; expect non-zero rows and **no** "Invalid metric fields" warning in the function logs.
3. Wait one orchestrator cycle (≤15 min); confirm `sync_jobs` rows for `sync-deep-dive` exist for all 7 mapped TikTok accounts.
4. Confirm `sync_logs` shows a `no_mappings` row for HEPT Agency 5.
