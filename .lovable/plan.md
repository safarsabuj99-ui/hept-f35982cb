

## Fix: Instant Platform Pause on Ad Guard Trigger

### Problem
When Ad Guard triggers (balance drops below threshold), campaigns are marked as `guard_paused` in the database but the actual platform API call (Meta/Google/TikTok) only happens when the 2-minute cron runs `ad-guard-check`, or when admin manually clicks "Verify." The user expects campaigns to be paused on the ad platform **instantly** (~1-3 seconds).

### Root Cause
The `instant_guard_pause` trigger (which used `pg_net` to fire HTTP calls immediately) was dropped in migration `20260330` as "fragile." Now only the cron-based `ad-guard-check` processes the queue.

### Solution
Re-introduce the `instant_guard_pause` database trigger with improved reliability. When `auto_pause_on_debit` sets campaigns to `guard_paused`, this trigger fires immediately and calls the `pause-campaign` edge function for each campaign via `pg_net`.

### Changes

**1. Database Migration — Re-create `instant_guard_pause` trigger**
- Create function `instant_guard_pause()` using `pg_net` extension to POST to `pause-campaign`
- Reads Supabase URL and service role key from vault (already stored there)
- Fires for each campaign row when `status` changes to `guard_paused`
- Includes safety check: skips if vault secrets are missing (falls back to cron)
- The `ad-guard-check` cron remains as a safety net for any that fail

**2. Update `ad-guard-check` edge function — Skip already-confirmed jobs**
- In Phase 1, if `pause_confirmed_at` is already set, delete the job immediately (instant trigger already handled it)
- This avoids duplicate API calls when the cron runs after instant trigger succeeded

### Flow After Fix
```text
Debit inserted
  → auto_pause_on_debit trigger
    → campaigns.status = 'guard_paused'
    → guard_pause_jobs queue entry created
    → instant_guard_pause trigger fires (pg_net)
      → POST /pause-campaign for each campaign (~1-3s)
      → Platform API pauses campaign
      → DB updated to status='paused', pause_confirmed_at set
  → ad-guard-check cron (every 2 min) picks up any failures
```

### Technical Details
- `pg_net` extension is already enabled
- `pause-campaign` already accepts service role auth and handles all 3 platforms
- The trigger uses `SECURITY DEFINER` and reads secrets from Supabase vault
- Vault secrets `supabase_url` and `service_role_key` are auto-provisioned by Lovable Cloud

