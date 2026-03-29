

## Fix: Instant Platform Pause When Ad Guard Triggers

### Root Cause

The `auto_pause_on_debit` DB trigger instantly sets campaign status to `guard_paused` in the database. But the actual API call to pause on TikTok/Meta/Google only happens when the `ad-guard-check` cron runs every 5 minutes. During that gap, campaigns remain active on the ad platform and keep spending money.

Your screenshots confirm this: local status shows "Guard Paused" but TikTok Ads Manager shows campaigns still "Active".

### Solution: Instant Platform Pause via `pg_net`

Use PostgreSQL's `pg_net` extension (available in the backend) to fire an HTTP request to the `pause-campaign` edge function immediately when a campaign is set to `guard_paused`. This eliminates the 5-minute delay entirely.

### Changes

#### 1. Database Migration — Enable `pg_net` + Create Trigger

Create a trigger on the `campaigns` table that fires when `status` changes to `guard_paused`. It uses `net.http_post` to call the existing `pause-campaign` edge function with the service role key, so the platform pause happens within seconds.

```sql
-- Enable pg_net extension
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Trigger function: instantly call pause-campaign API
CREATE OR REPLACE FUNCTION public.instant_guard_pause()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _supabase_url text;
  _service_key text;
BEGIN
  -- Only fire when status changes TO guard_paused
  IF NEW.status <> 'guard_paused' THEN RETURN NEW; END IF;
  IF OLD.status = 'guard_paused' THEN RETURN NEW; END IF;

  SELECT decrypted_secret INTO _supabase_url FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL' LIMIT 1;
  SELECT decrypted_secret INTO _service_key FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY' LIMIT 1;

  -- Fire-and-forget HTTP call to pause-campaign
  PERFORM net.http_post(
    url := _supabase_url || '/functions/v1/pause-campaign',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || _service_key
    ),
    body := jsonb_build_object(
      'campaign_id', NEW.id,
      'action', 'pause'
    )
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_instant_guard_pause
  AFTER UPDATE OF status ON public.campaigns
  FOR EACH ROW
  WHEN (NEW.status = 'guard_paused' AND OLD.status IS DISTINCT FROM 'guard_paused')
  EXECUTE FUNCTION public.instant_guard_pause();
```

#### 2. Update `pause-campaign` Edge Function

Minor fix: when called with a `guard_paused` campaign via service role, it should:
- Call the platform API to pause
- Update status from `guard_paused` → `paused` (confirming platform sync)
- This already works — the existing code handles `guard_paused` as needing a pause (line 130: `normalizedStatus = "active"`)

No code changes needed in the edge function — it already handles this correctly.

#### 3. Keep `ad-guard-check` Cron as Safety Net

The 5-minute cron remains as a fallback for any campaigns where the instant trigger fails (network timeout, edge function cold start, etc.). No changes needed — it already picks up `guard_paused` campaigns in Phase 1.

### Flow After Fix

```text
Debit transaction inserted
  → auto_pause_on_debit trigger fires
    → Sets campaigns to "guard_paused" in DB
      → trg_instant_guard_pause fires (pg_net)
        → Calls pause-campaign edge function
          → Pauses on TikTok/Meta/Google API
          → Updates DB: guard_paused → paused
```

Total delay: ~1-3 seconds instead of up to 5 minutes.

### Files Changed
- **Database migration** — `pg_net` extension + `instant_guard_pause` trigger function + trigger
- No edge function or frontend changes needed

