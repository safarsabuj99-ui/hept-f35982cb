CREATE OR REPLACE FUNCTION public.check_auto_resume()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_client_id uuid;
  v_paused_campaigns jsonb;
  v_campaign_ids text[];
  v_is_payment_approval boolean;
  v_count integer;
  v_window_hours integer;
  v_guard_paused_at timestamptz;
  v_org_id uuid;
  v_campaign_id text;
  v_anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhocGlpbW52a2dtcGZubGRnZGhjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExNDI5NTksImV4cCI6MjA4NjcxODk1OX0.-rT23NY6GRn-9Q5cgraDlzu6gazbPj1al8ouvmgZmI4';
BEGIN
  IF NEW.type <> 'credit' OR NEW.status <> 'completed' THEN
    RETURN NEW;
  END IF;

  -- ONLY auto-resume on approved payment requests (no more balance-recovery auto-resume)
  v_is_payment_approval := COALESCE(NEW.description, '') LIKE 'Payment:%';
  IF NOT v_is_payment_approval THEN
    RETURN NEW;
  END IF;

  v_client_id := NEW.client_id;

  SELECT system_paused_campaigns, guard_resume_window_hours, guard_paused_at, org_id
  INTO v_paused_campaigns, v_window_hours, v_guard_paused_at, v_org_id
  FROM public.profiles
  WHERE user_id = v_client_id;

  IF v_paused_campaigns IS NULL OR jsonb_array_length(v_paused_campaigns) = 0 THEN
    RETURN NEW;
  END IF;

  v_window_hours := COALESCE(v_window_hours, 24);

  -- Grace-window check: payment must land within N hours of guard pause
  IF v_guard_paused_at IS NOT NULL
     AND now() - v_guard_paused_at > (v_window_hours || ' hours')::interval THEN
    INSERT INTO public.audit_logs (user_id, action_type, description, org_id)
    VALUES (
      v_client_id,
      'ad_guard_resume_skipped_window',
      'Payment approved but Ad Guard grace window (' || v_window_hours ||
      'h) expired at ' || (v_guard_paused_at + (v_window_hours || ' hours')::interval)::text ||
      '. Campaigns require manual resume.',
      v_org_id
    );

    INSERT INTO public.notifications (user_id, title, body, type, link, org_id, priority)
    VALUES (
      v_client_id,
      'Payment Approved — Manual Resume Required',
      'Your payment was approved, but the ' || v_window_hours || '-hour auto-resume window has expired. Please resume your paused campaigns manually from the dashboard.',
      'guard',
      '/dashboard?highlight=paused',
      v_org_id,
      'high'
    );
    RETURN NEW;
  END IF;

  SELECT array_agg(elem::text)
  INTO v_campaign_ids
  FROM jsonb_array_elements_text(v_paused_campaigns) AS elem;

  v_count := COALESCE(array_length(v_campaign_ids, 1), 0);

  -- Mark as auto-resume for notify_on_guard_resume branch
  PERFORM set_config('app.guard_auto_resume', 'true', true);

  UPDATE public.campaigns
  SET status = 'active',
      pause_required = false,
      pause_requested_at = NULL,
      pause_confirmed_at = NULL,
      pause_attempt_count = 0,
      pause_error = NULL,
      updated_at = now()
  WHERE id::text = ANY(v_campaign_ids)
    AND status IN ('guard_paused', 'paused');

  DELETE FROM public.guard_pause_jobs
  WHERE campaign_id::text = ANY(v_campaign_ids);

  UPDATE public.profiles
  SET system_paused_campaigns = '[]'::jsonb,
      guard_paused_at = NULL
  WHERE user_id = v_client_id;

  -- Fire platform resume for each campaign via pause-campaign (action=enable)
  -- Service-role Bearer token bypasses "already active" early-return in pause-campaign
  FOREACH v_campaign_id IN ARRAY v_campaign_ids LOOP
    PERFORM net.http_post(
      url := 'https://hhpiimnvkgmpfnldgdhc.supabase.co/functions/v1/pause-campaign',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_anon_key
      ),
      body := jsonb_build_object(
        'campaign_id', v_campaign_id,
        'action', 'enable'
      )
    );
  END LOOP;

  INSERT INTO public.audit_logs (user_id, action_type, description, org_id)
  VALUES (
    v_client_id,
    'ad_guard_resume',
    'Auto-resumed ' || v_count || ' campaign(s) after payment approval (within ' || v_window_hours || 'h grace window). Platform resume API dispatched.',
    v_org_id
  );

  RETURN NEW;
END;
$function$;