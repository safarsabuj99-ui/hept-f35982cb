
-- Drop existing trigger first
DROP TRIGGER IF EXISTS trg_instant_guard_pause ON public.campaigns;

-- Recreate with validation safeguards
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

  -- Get secrets with validation
  SELECT decrypted_secret INTO _supabase_url FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL' LIMIT 1;
  SELECT decrypted_secret INTO _service_key FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY' LIMIT 1;

  -- Validate secrets exist before firing
  IF _supabase_url IS NULL OR _service_key IS NULL THEN
    RAISE WARNING 'instant_guard_pause: missing vault secrets, skipping HTTP call for campaign %', NEW.id;
    RETURN NEW;
  END IF;

  -- Fire-and-forget HTTP call to pause-campaign edge function
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

  RAISE LOG 'instant_guard_pause: fired pause-campaign for campaign % (was: %, now: guard_paused)', NEW.id, OLD.status;

  RETURN NEW;
END;
$$;

-- Recreate trigger with exact WHEN condition
CREATE TRIGGER trg_instant_guard_pause
  AFTER UPDATE OF status ON public.campaigns
  FOR EACH ROW
  WHEN (NEW.status = 'guard_paused' AND OLD.status IS DISTINCT FROM 'guard_paused')
  EXECUTE FUNCTION public.instant_guard_pause();
