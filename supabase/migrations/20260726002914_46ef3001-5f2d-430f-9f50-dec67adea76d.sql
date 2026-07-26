
-- 1. Rewrite trigger_send_push: forward priority + group_key, mark origin
CREATE OR REPLACE FUNCTION public.trigger_send_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM net.http_post(
    url := 'https://hhpiimnvkgmpfnldgdhc.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-notification-id', NEW.id::text,
      'x-push-source', 'db-trigger',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhocGlpbW52a2dtcGZubGRnZGhjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExNDI5NTksImV4cCI6MjA4NjcxODk1OX0.-rT23NY6GRn-9Q5cgraDlzu6gazbPj1al8ouvmgZmI4'
    ),
    body := jsonb_build_object(
      'notification_id', NEW.id,
      'user_id', NEW.user_id,
      'title', NEW.title,
      'body', NEW.body,
      'link', NEW.link,
      'type', NEW.type::text,
      'priority', COALESCE(NEW.priority, 'normal'),
      'group_key', NEW.group_key
    )
  );
  RETURN NEW;
END;
$function$;

-- 2. New: notify agency when a CLIENT pauses their own campaign
CREATE OR REPLACE FUNCTION public.notify_on_client_pause()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_client_name text;
  v_client_role boolean;
  v_admin record;
  v_platform text;
BEGIN
  -- Only fire when transitioning INTO a manual paused state (not guard_paused, which has its own trigger)
  IF NEW.status <> 'paused' THEN RETURN NEW; END IF;
  IF OLD.status = 'paused' OR OLD.status = 'guard_paused' THEN RETURN NEW; END IF;
  IF NEW.client_id IS NULL OR NEW.org_id IS NULL THEN RETURN NEW; END IF;

  -- Only fire if the caller is the client themselves (agency-side pauses don't need this)
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'client'
  ) INTO v_client_role;

  IF NOT v_client_role THEN RETURN NEW; END IF;

  -- Debounce bulk pauses: skip if a client-pause notification already fired in last 30s
  IF EXISTS (
    SELECT 1 FROM public.notifications
    WHERE org_id = NEW.org_id
      AND type = 'campaign'
      AND group_key = 'client_pause_' || NEW.client_id::text
      AND created_at > now() - interval '30 seconds'
  ) THEN RETURN NEW; END IF;

  SELECT NULLIF(TRIM(full_name), '') INTO v_client_name
  FROM public.profiles WHERE user_id = NEW.client_id LIMIT 1;

  v_platform := COALESCE(NEW.platform::text, 'platform');

  FOR v_admin IN
    SELECT ur.user_id FROM public.user_roles ur
    JOIN public.profiles p ON p.user_id = ur.user_id
    WHERE ur.role IN ('admin', 'manager') AND p.org_id = NEW.org_id
  LOOP
    INSERT INTO public.notifications (user_id, title, body, type, link, org_id, priority, group_key)
    VALUES (
      v_admin.user_id,
      'Client Paused a Campaign ⏸️',
      COALESCE(v_client_name, 'A client') || ' paused "' || COALESCE(NEW.campaign_name, 'a campaign') || '" (' || v_platform || ')',
      'campaign',
      '/admin/clients/' || NEW.client_id::text || '?tab=campaigns',
      NEW.org_id,
      'high',
      'client_pause_' || NEW.client_id::text
    );
  END LOOP;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_notify_on_client_pause ON public.campaigns;
CREATE TRIGGER trg_notify_on_client_pause
  AFTER UPDATE OF status ON public.campaigns
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_client_pause();
