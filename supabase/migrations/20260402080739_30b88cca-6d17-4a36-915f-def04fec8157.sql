
-- Create the instant guard pause function
CREATE OR REPLACE FUNCTION public.instant_guard_pause()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_url text;
  v_key text;
BEGIN
  -- Only fire when status just changed to guard_paused
  IF NEW.status <> 'guard_paused' THEN
    RETURN NEW;
  END IF;
  IF OLD.status = 'guard_paused' THEN
    RETURN NEW;
  END IF;

  -- Read secrets from vault
  BEGIN
    SELECT decrypted_secret INTO v_url
    FROM vault.decrypted_secrets
    WHERE name = 'supabase_url' LIMIT 1;

    SELECT decrypted_secret INTO v_key
    FROM vault.decrypted_secrets
    WHERE name = 'service_role_key' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    -- Vault not available, fall back to cron
    RETURN NEW;
  END;

  -- Safety: skip if secrets missing
  IF v_url IS NULL OR v_key IS NULL THEN
    RETURN NEW;
  END IF;

  -- Fire async HTTP POST to pause-campaign
  PERFORM net.http_post(
    url := v_url || '/functions/v1/pause-campaign',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body := jsonb_build_object(
      'campaign_id', NEW.id,
      'action', 'pause'
    )
  );

  RETURN NEW;
END;
$$;

-- Create trigger on campaigns table
DROP TRIGGER IF EXISTS trg_instant_guard_pause ON public.campaigns;
CREATE TRIGGER trg_instant_guard_pause
  AFTER UPDATE ON public.campaigns
  FOR EACH ROW
  EXECUTE FUNCTION public.instant_guard_pause();
