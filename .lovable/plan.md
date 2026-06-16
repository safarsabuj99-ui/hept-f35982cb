## Diagnosis

TikTok auth and proxy are not the main problem right now. Tokens are active and using the US proxy.

The current issues are:

1. **Automatic deep-dive is blocked by queue uniqueness**
   - The orchestrator builds multiple date chunks for TikTok deep-dive.
   - But the database has an active-job unique index on only `(ad_account_id, function_name)`, so only one active deep-dive job per account can exist.
   - Result: automatic TikTok chunked jobs are not actually inserted/processed correctly, especially when pending jobs already exist.

2. **Sync success count is misleading**
   - `sync-deep-dive` returns `rows_synced: totalSynced`, where `totalSynced` means accounts processed, not TikTok API rows or metric rows written.
   - So jobs show `rows_synced = 1` even if TikTok returned 0 rows, 100 rows, or rows were skipped by keyword matching.

3. **TikTok data can be fetched but skipped by mapping**
   - Deep-dive only writes rows when campaign name matches an `ad_account_clients.mapping_keyword` or an existing campaign mapping.
   - Accounts with stale/too narrow keywords can show successful API calls but no usable metrics.

4. **Future API field changes are not guarded enough**
   - TikTok has already rejected deprecated metrics before.
   - The code logs some 40002 invalid-metric data, but it still needs stronger per-metric fallback and clearer sync logs.

## Fix plan

### 1. Fix the queue uniqueness rule
- Add a database migration that replaces the bad active-job unique index.
- Remove/replace `idx_sync_jobs_unique_active` so chunked jobs are allowed per account/date.
- Keep uniqueness on `(ad_account_id, function_name, date_from/date_to)` for chunked windows to prevent duplicates.
- Keep a separate safe uniqueness rule for non-chunked/full jobs.

### 2. Make orchestrator inserts reliable
- In `sync-orchestrator`, insert chunk jobs with conflict-safe behavior.
- Count and log insert errors instead of silently reporting jobs that the database rejected.
- Ensure TikTok deep-dive queues all 7-day chunks for all active mapped TikTok accounts.

### 3. Return real sync numbers
- In `sync-deep-dive`, track:
  - API rows fetched
  - rows matched to clients
  - `daily_metrics` rows attempted/written
  - skipped rows due to missing keyword/mapping
- Return `rows_synced` as actual metrics rows written, not account count.
- Return separate fields like `accounts_synced`, `api_rows_fetched`, and `skipped_no_keyword_match`.

### 4. Improve TikTok failure visibility
- If TikTok API returns rows but all are skipped by mapping, write a clear `sync_logs` warning/error such as `mapping_miss`.
- Include account name/date window and count of skipped campaigns.
- Keep invalid metric `40002` logs, but make the function fail the job only when no fallback path succeeds.

### 5. Validate with a 7-day TikTok backfill
- Deploy changed edge functions.
- Trigger the orchestrator for `sync-deep-dive`.
- Verify active TikTok accounts receive chunked jobs.
- Verify `daily_metrics` has fresh TikTok rows for the last 7 days.
- Verify jobs show real row counts, not always `1`.

## Prevention

- Add queue constraints that match chunked-sync behavior, so future chunking changes cannot be blocked by a broad unique index.
- Log “API returned rows but mapping skipped them” as a first-class sync condition.
- Track real API rows vs written rows separately so the Sync UI does not hide problems behind `success: 1`.
- Keep TikTok metric groups isolated so one deprecated metric cannot break the whole sync window.