-- Helper: pretty-format a numeric with thousand separators, no trailing zeros
CREATE OR REPLACE FUNCTION public.fmt_money(n numeric)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN n IS NULL THEN '—'
    WHEN n = trunc(n) THEN to_char(n, 'FM999,999,999,990')
    ELSE to_char(n, 'FM999,999,999,990.00')
  END
$$;

-- 1. Payment request created
CREATE OR REPLACE FUNCTION public.notify_on_payment_request_created()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_client_name text;
  v_org_id uuid;
  v_admin record;
BEGIN
  SELECT NULLIF(TRIM(full_name), ''), org_id INTO v_client_name, v_org_id
  FROM public.profiles WHERE user_id = NEW.client_id LIMIT 1;

  FOR v_admin IN
    SELECT ur.user_id FROM public.user_roles ur
    JOIN public.profiles p ON p.user_id = ur.user_id
    WHERE ur.role = 'admin' AND (v_org_id IS NULL OR p.org_id = v_org_id)
  LOOP
    INSERT INTO public.notifications (user_id, title, body, type, link, org_id, priority, group_key)
    VALUES (
      v_admin.user_id,
      'New Payment Request',
      COALESCE(v_client_name, 'A client') || ' submitted ৳' || public.fmt_money(NEW.amount_bdt) || ' via ' || NEW.payment_method::text,
      'payment',
      '/admin/payment-requests?highlight=' || NEW.id::text,
      v_org_id,
      'high',
      'payment_' || NEW.client_id::text
    );
  END LOOP;
  RETURN NEW;
END;
$function$;

-- 2. Payment status change
CREATE OR REPLACE FUNCTION public.notify_on_payment_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_body text;
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('approved', 'rejected') THEN RETURN NEW; END IF;

  IF NEW.status = 'approved' THEN
    v_body := '৳' || public.fmt_money(NEW.amount_bdt) || ' approved'
              || CASE WHEN NEW.final_amount_usd IS NOT NULL
                   THEN ' → $' || public.fmt_money(NEW.final_amount_usd)
                   ELSE '' END;
  ELSE
    v_body := '৳' || public.fmt_money(NEW.amount_bdt) || ' was rejected'
              || COALESCE('. Note: ' || NULLIF(TRIM(NEW.admin_note), ''), '');
  END IF;

  INSERT INTO public.notifications (user_id, title, body, type, link, org_id, priority)
  VALUES (
    NEW.client_id,
    CASE WHEN NEW.status = 'approved' THEN 'Payment Approved ✅' ELSE 'Payment Rejected ❌' END,
    v_body,
    'payment',
    '/dashboard/wallet?highlight=' || NEW.id::text,
    NEW.org_id,
    CASE WHEN NEW.status = 'rejected' THEN 'urgent' ELSE 'normal' END
  );
  RETURN NEW;
END;
$function$;

-- 3. Guard pause: trim client name
CREATE OR REPLACE FUNCTION public.notify_on_guard_pause()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_client_name text;
  v_org_id uuid;
  v_admin record;
  v_count integer;
BEGIN
  IF NEW.status <> 'guard_paused' THEN RETURN NEW; END IF;
  IF OLD.status = 'guard_paused' THEN RETURN NEW; END IF;
  IF NEW.client_id IS NULL THEN RETURN NEW; END IF;

  SELECT NULLIF(TRIM(full_name), ''), org_id INTO v_client_name, v_org_id
  FROM public.profiles WHERE user_id = NEW.client_id LIMIT 1;

  SELECT count(*) INTO v_count FROM public.campaigns
  WHERE client_id = NEW.client_id AND status = 'guard_paused';

  IF EXISTS (
    SELECT 1 FROM public.notifications
    WHERE user_id = NEW.client_id AND type = 'guard'
      AND title = 'Campaigns Paused ⚠️'
      AND created_at > now() - interval '30 seconds'
  ) THEN RETURN NEW; END IF;

  INSERT INTO public.notifications (user_id, title, body, type, link, org_id, priority, group_key)
  VALUES (
    NEW.client_id,
    'Campaigns Paused ⚠️',
    v_count || ' campaign(s) paused due to low balance. Add funds to resume.',
    'guard',
    '/dashboard/wallet?highlight=guard',
    v_org_id,
    'urgent',
    'guard_pause_' || NEW.client_id::text
  );

  FOR v_admin IN
    SELECT ur.user_id FROM public.user_roles ur
    JOIN public.profiles p ON p.user_id = ur.user_id
    WHERE ur.role = 'admin' AND (v_org_id IS NULL OR p.org_id = v_org_id)
  LOOP
    INSERT INTO public.notifications (user_id, title, body, type, link, org_id, priority, group_key)
    VALUES (
      v_admin.user_id,
      'Ad Guard Triggered',
      COALESCE(v_client_name, 'Client') || ': ' || v_count || ' campaign(s) paused (low balance)',
      'guard',
      '/admin/clients/' || NEW.client_id || '?tab=automation',
      v_org_id,
      'urgent',
      'guard_pause_' || NEW.client_id::text
    );
  END LOOP;
  RETURN NEW;
END;
$function$;

-- 4. Guard resume: include count, trim name, keep auto/manual branching
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
  v_count integer;
  v_client_title text;
  v_client_body text;
  v_admin_title text;
  v_admin_body text;
BEGIN
  IF OLD.status NOT IN ('guard_paused', 'paused') THEN RETURN NEW; END IF;
  IF NEW.status <> 'active' THEN RETURN NEW; END IF;
  IF NEW.client_id IS NULL THEN RETURN NEW; END IF;

  IF EXISTS (
    SELECT 1 FROM public.notifications
    WHERE user_id = NEW.client_id AND type = 'guard'
      AND (title = 'Campaigns Resumed ✅' OR title = 'Campaigns Resumed ▶️')
      AND created_at > now() - interval '30 seconds'
  ) THEN RETURN NEW; END IF;

  SELECT NULLIF(TRIM(full_name), ''), org_id INTO v_client_name, v_org_id
  FROM public.profiles WHERE user_id = NEW.client_id LIMIT 1;

  -- Count campaigns just brought back to active in the last 10 seconds (covers a bulk batch)
  SELECT GREATEST(count(*), 1) INTO v_count
  FROM public.campaigns
  WHERE client_id = NEW.client_id
    AND status = 'active'
    AND updated_at > now() - interval '10 seconds';

  v_is_auto := COALESCE(current_setting('app.guard_auto_resume', true), '') = 'true';

  IF v_is_auto THEN
    v_client_title := 'Campaigns Resumed ✅';
    v_client_body  := v_count || ' campaign(s) resumed after balance top-up.';
    v_admin_title  := 'Campaigns Resumed';
    v_admin_body   := COALESCE(v_client_name, 'Client') || ': ' || v_count || ' campaign(s) auto-resumed after deposit.';
  ELSE
    v_client_title := 'Campaigns Resumed ▶️';
    v_client_body  := v_count || ' campaign(s) resumed by your account manager.';
    v_admin_title  := 'Campaigns Resumed';
    v_admin_body   := COALESCE(v_client_name, 'Client') || ': ' || v_count || ' campaign(s) manually resumed.';
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
      v_admin_body,
      'guard',
      '/admin/clients/' || NEW.client_id || '?tab=automation',
      v_org_id,
      'normal'
    );
  END LOOP;
  RETURN NEW;
END;
$function$;

-- 5. Campaign request: graceful budget formatting + trimmed client name
CREATE OR REPLACE FUNCTION public.notify_on_campaign_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_client_name text;
  v_org_id uuid;
  v_admin record;
  v_body text;
  v_budget_text text;
BEGIN
  SELECT NULLIF(TRIM(full_name), ''), org_id INTO v_client_name, v_org_id
  FROM public.profiles WHERE user_id = NEW.client_id LIMIT 1;

  IF TG_OP = 'INSERT' THEN
    IF COALESCE(NEW.task_count, 0) > 0 THEN
      v_budget_text := CASE
        WHEN NEW.total_budget_usd IS NOT NULL AND NEW.total_budget_usd > 0
          THEN ' ($' || public.fmt_money(NEW.total_budget_usd) || ')'
        ELSE ''
      END;
      v_body := COALESCE(v_client_name, 'A client') || ' submitted "'
                || COALESCE(NULLIF(TRIM(NEW.title), ''), 'Untitled') || '" with '
                || NEW.task_count || ' task(s)' || v_budget_text;
    ELSE
      v_budget_text := CASE
        WHEN NEW.budget_usd IS NOT NULL AND NEW.budget_usd > 0
          THEN ' ($' || public.fmt_money(NEW.budget_usd) || ')'
        ELSE ''
      END;
      v_body := COALESCE(v_client_name, 'A client') || ' requested a '
                || NEW.platform::text || ' campaign' || v_budget_text;
    END IF;

    FOR v_admin IN
      SELECT ur.user_id FROM public.user_roles ur
      JOIN public.profiles p ON p.user_id = ur.user_id
      WHERE ur.role = 'admin' AND (v_org_id IS NULL OR p.org_id = v_org_id)
    LOOP
      INSERT INTO public.notifications (user_id, title, body, type, link, org_id, priority, group_key)
      VALUES (
        v_admin.user_id,
        'New Campaign Request',
        v_body,
        'campaign',
        '/admin/orders?highlight=' || NEW.id::text,
        v_org_id,
        'high',
        'campaign_req_' || NEW.client_id::text
      );
    END LOOP;
  ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    IF NEW.status IN ('completed', 'rejected') THEN
      INSERT INTO public.notifications (user_id, title, body, type, link, org_id, priority)
      VALUES (
        NEW.client_id,
        CASE WHEN NEW.status = 'completed' THEN 'Campaign Completed ✅' ELSE 'Campaign Rejected ❌' END,
        'Your campaign request "' || COALESCE(NULLIF(TRIM(NEW.title), ''), NEW.platform::text)
          || '" was ' || NEW.status::text
          || CASE WHEN NEW.status = 'rejected' AND NULLIF(TRIM(NEW.rejection_reason), '') IS NOT NULL
              THEN '. Reason: ' || TRIM(NEW.rejection_reason) ELSE '' END,
        'campaign',
        '/dashboard/campaigns?highlight=' || NEW.id::text,
        v_org_id,
        CASE WHEN NEW.status = 'rejected' THEN 'urgent' ELSE 'normal' END
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;