
-- Enable pg_net extension for fire-and-forget HTTP calls from triggers
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Trigger function: instantly call pause-campaign edge function when guard_paused
CREATE OR REPLACE FUNCTION public.instant_guard_pause()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _supabase_url text;
  _service_key text;
BEGIN
  IF NEW.status <> 'guard_paused' THEN RETURN NEW; END IF;
  IF OLD.status = 'guard_paused' THEN RETURN NEW; END IF;

  SELECT decrypted_secret INTO _supabase_url FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL' LIMIT 1;
  SELECT decrypted_secret INTO _service_key FROM vault.decrypted_secrets WHERE name = 'SUPABASE_SERVICE_ROLE_KEY' LIMIT 1;

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

-- Trigger: fires immediately when any campaign status changes to guard_paused
CREATE TRIGGER trg_instant_guard_pause
  AFTER UPDATE OF status ON public.campaigns
  FOR EACH ROW
  WHEN (NEW.status = 'guard_paused' AND OLD.status IS DISTINCT FROM 'guard_paused')
  EXECUTE FUNCTION public.instant_guard_pause();
