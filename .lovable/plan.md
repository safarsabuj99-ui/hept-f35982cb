
Goal: make Ad Guard fully automatic so campaigns pause on the ad platform without clicking “Verify”, and the UI updates by itself.

What I found
- The current “Verify” button in `src/components/AutomationConfigTab.tsx` is not just checking status; it runs the full `ad-guard-check` worker. That means manual verification is currently acting as the missing automation path.
- `supabase/functions/ad-guard-check/index.ts` exists and can process queued pause jobs, but I did not find any scheduled invocation for it. So if the instant path fails, nothing automatically picks up the queue.
- The instant trigger function (`instant_guard_pause`) depends on values from `vault.decrypted_secrets`. In the codebase it looks for vault rows like `supabase_url` / `service_role_key`, and if they are missing it silently returns. That matches your symptom: campaign becomes `guard_paused` in the SaaS, but the ad platform stays active until a manual action runs the worker.
- The backend schema snapshot also reports no live DB triggers attached right now, so part of the fix should be re-applying and validating the actual Ad Guard triggers in the database.

Implementation plan

1. Harden the instant auto-pause path
- Create a backend migration that re-creates the critical Ad Guard triggers:
  - `trg_auto_pause_on_debit`
  - `trg_check_auto_resume`
  - `trg_instant_guard_pause`
- Replace `public.instant_guard_pause()` so it no longer depends on vault lookups that can silently fail.
- Make it call `pause-campaign` directly using the same project URL/auth pattern already used by the working push trigger approach.
- Keep the durable queue as fallback, so the system has both:
  - instant pause attempt
  - scheduled retry/verification path

2. Add real automatic background processing
- Configure a backend scheduled job to invoke `ad-guard-check` every 1–2 minutes.
- This worker will:
  - process pending `guard_pause_jobs`
  - verify platform pause state
  - retry transient failures
  - re-queue stuck `guard_paused` campaigns
- Result: even if the instant trigger misses once, the worker finishes the job automatically.

3. Tighten the worker logic
- Update `supabase/functions/ad-guard-check/index.ts` to correctly select and use all pause state fields it relies on, including `pause_confirmed_at`.
- Improve job status handling so campaigns do not sit in endless “pending verify” state when a retry/backoff is active.
- Add clearer audit/error updates for:
  - queued
  - retry scheduled
  - permanently failed
  - confirmed paused

4. Fix the UI so it reflects automation correctly
- Update `src/components/AutomationConfigTab.tsx`:
  - rename “Verify” to “Retry now” or “Check now”
  - stop presenting manual verification as a required step
  - auto-refresh paused campaign status while any campaign is pending
  - show clearer states such as:
    - Queued
    - Pausing now
    - Retrying
    - Verified
    - Failed
- Keep a manual retry button for admins, but only as a backup tool.

5. Validate end-to-end
- Trigger a low-balance pause scenario for a test client.
- Confirm this full flow without clicking Verify:
  - balance crosses threshold
  - campaign becomes `guard_paused`
  - platform campaign pauses automatically
  - `pause_confirmed_at` is set
  - queue entry is cleared
  - UI updates from pending to verified by itself
- Also confirm deposit-based auto-resume still works after the changes.

Technical details
- Files likely involved:
  - new migration for triggers + instant pause function
  - `supabase/functions/ad-guard-check/index.ts`
  - `src/components/AutomationConfigTab.tsx`
  - possibly `supabase/functions/pause-campaign/index.ts` for small logging/status refinements
- Intended final flow:

```text
auto debit / low balance
  -> mark campaign guard_paused + queue job
  -> instant trigger calls pause-campaign immediately
  -> scheduled ad-guard-check verifies/retries automatically
  -> pause_confirmed_at set
  -> UI auto-refresh shows Verified
```

Expected outcome
- No manual Verify step needed
- Campaigns pause automatically on Meta/TikTok/Google
- Admin UI no longer gets stuck showing long-running “loading verify”
- Manual action remains only as an emergency retry, not part of the normal flow
