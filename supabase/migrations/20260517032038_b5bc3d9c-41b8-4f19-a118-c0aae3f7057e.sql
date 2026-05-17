-- 1. Tag deposit-driven resumes with a session-local GUC
CREATE OR REPLACE FUNCTION public.check_auto_resume()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_client_id uuid;
  v_balance numeric;
  v_pause_threshold numeric;
  v_overdraft numeric;
  v_effective_threshold numeric;
  v_paused_campaigns jsonb;
  v_campaign_ids text[];
  v_is_payment_approval boolean;
  v_count integer;
BEGIN
  IF NEW.type <> 'credit' OR NEW.status <> 'completed' THEN
    RETURN NEW;
  END IF;

  v_client_id := NEW.client_id;

  SELECT system_paused_campaigns
  INTO v_paused_campaigns
  FROM public.profiles
  WHERE user_id = v_client_id;

  IF v_paused_campaigns IS NULL OR jsonb_array_length(v_paused_campaigns) = 0 THEN
    RETURN NEW;
  END IF;

  v_is_payment_approval := COALESCE(NEW.description, '') LIKE 'Payment:%';

  IF NOT v_is_payment_approval THEN
    SELECT COALESCE(SUM(CASE WHEN type = 'credit' AND status = 'completed' THEN amount ELSE 0 END), 0)
         - COALESCE(SUM(CASE WHEN type = 'debit'  AND status = 'completed' THEN amount ELSE 0 END), 0)
    INTO v_balance
    FROM public.transactions
    WHERE client_id = v_client_id;

    SELECT auto_pause_balance_usd, overdraft_limit_usd
    INTO v_pause_threshold, v_overdraft
    FROM public.profiles
    WHERE user_id = v_client_id;

    v_effective_threshold := COALESCE(v_pause_threshold, 5) - COALESCE(v_overdraft, 0);

    IF v_balance <= v_effective_threshold THEN
      RETURN NEW;
    END IF;
  END IF;

  SELECT array_agg(elem::text)
  INTO v_campaign_ids
  FROM jsonb_array_elements_text(v_paused_campaigns) AS elem;

  v_count := COALESCE(array_length(v_campaign_ids, 1), 0);

  -- Mark this resume as deposit-driven so notify_on_guard_resume picks the auto-path
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

  INSERT INTO public.audit_logs (user_id, action_type, description)
  VALUES (
    v_client_id,
    'ad_guard_resume',
    CASE WHEN v_is_payment_approval
      THEN 'Auto-resumed ' || v_count || ' campaign(s) after payment approval (reason: payment_approved)'
      ELSE 'Auto-resumed ' || v_count || ' campaign(s) after deposit. New balance: $' || ROUND(v_balance, 2) || ' (threshold: $' || v_effective_threshold || ')'
    END
  );

  RETURN NEW;
END;
$function$;

-- 2. Branch notify_on_guard_resume on the marker
CREATE OR REPLACE FUNCTION public.notify_on_guard_resume()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_client_name text;
  v_org_id uuid;
  v_admin record;
  v_is_auto boolean;
  v_client_title text;
  v_client_body text;
  v_admin_title text;
  v_admin_body_suffix text;
BEGIN
  IF OLD.status NOT IN ('guard_paused', 'paused') THEN RETURN NEW; END IF;
  IF NEW.status <> 'active' THEN RETURN NEW; END IF;
  IF NEW.client_id IS NULL THEN RETURN NEW; END IF;

  -- Dedup: skip if any resume notification was just sent for this client
  IF EXISTS (
    SELECT 1 FROM public.notifications
    WHERE user_id = NEW.client_id AND type = 'guard'
      AND (title = 'Campaigns Resumed ✅' OR title = 'Campaign Resumed ▶️')
      AND created_at > now() - interval '30 seconds'
  ) THEN RETURN NEW; END IF;

  SELECT full_name, org_id INTO v_client_name, v_org_id
  FROM public.profiles WHERE user_id = NEW.client_id LIMIT 1;

  v_is_auto := COALESCE(current_setting('app.guard_auto_resume', true), '') = 'true';

  IF v_is_auto THEN
    v_client_title := 'Campaigns Resumed ✅';
    v_client_body  := 'Your campaigns have been resumed after balance top-up.';
    v_admin_title  := 'Campaigns Resumed';
    v_admin_body_suffix := '''s campaigns auto-resumed after deposit.';
  ELSE
    v_client_title := 'Campaign Resumed ▶️';
    v_client_body  := 'Your campaign was resumed by your account manager.';
    v_admin_title  := 'Campaign Resumed';
    v_admin_body_suffix := '''s campaign was manually resumed.';
  END IF;

  INSERT INTO public.notifications (user_id, title, body, type, link, org_id, priority)
  VALUES (
    NEW.client_id,
    v_client_title,
    v_client_body,
    'guard',
    '/dashboard?highlight=resumed',
    v_org_id,
    'normal'
  );

  FOR v_admin IN
    SELECT ur.user_id FROM public.user_roles ur
    JOIN public.profiles p ON p.user_id = ur.user_id
    WHERE ur.role = 'admin' AND (v_org_id IS NULL OR p.org_id = v_org_id)
  LOOP
    INSERT INTO public.notifications (user_id, title, body, type, link, org_id, priority)
    VALUES (
      v_admin.user_id,
      v_admin_title,
      COALESCE(v_client_name, 'Client') || v_admin_body_suffix,
      'guard',
      '/admin/clients/' || NEW.client_id || '?tab=automation',
      v_org_id,
      'normal'
    );
  END LOOP;
  RETURN NEW;
END;
$function$;