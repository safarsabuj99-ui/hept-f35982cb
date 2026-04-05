
-- Update notify_on_guard_pause with contextual links
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

  SELECT full_name, org_id INTO v_client_name, v_org_id
  FROM public.profiles WHERE user_id = NEW.client_id LIMIT 1;

  SELECT count(*) INTO v_count FROM public.campaigns
  WHERE client_id = NEW.client_id AND status = 'guard_paused';

  IF EXISTS (
    SELECT 1 FROM public.notifications
    WHERE user_id = NEW.client_id AND type = 'guard'
      AND title = 'Campaigns Paused ⚠️'
      AND created_at > now() - interval '30 seconds'
  ) THEN RETURN NEW; END IF;

  -- Client notification with guard highlight
  INSERT INTO public.notifications (user_id, title, body, type, link, org_id)
  VALUES (
    NEW.client_id,
    'Campaigns Paused ⚠️',
    v_count || ' campaign(s) paused due to low balance. Add funds to resume.',
    'guard',
    '/dashboard/wallet?highlight=guard',
    v_org_id
  );

  -- Admin notifications with client detail + automation tab
  FOR v_admin IN
    SELECT ur.user_id FROM public.user_roles ur
    JOIN public.profiles p ON p.user_id = ur.user_id
    WHERE ur.role = 'admin' AND (v_org_id IS NULL OR p.org_id = v_org_id)
  LOOP
    INSERT INTO public.notifications (user_id, title, body, type, link, org_id)
    VALUES (
      v_admin.user_id,
      'Ad Guard Triggered',
      COALESCE(v_client_name, 'Client') || ': ' || v_count || ' campaign(s) paused (low balance)',
      'guard',
      '/admin/clients/' || NEW.client_id || '?tab=automation',
      v_org_id
    );
  END LOOP;
  RETURN NEW;
END;
$function$;

-- Update notify_on_guard_resume with contextual links
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
BEGIN
  IF OLD.status NOT IN ('guard_paused', 'paused') THEN RETURN NEW; END IF;
  IF NEW.status <> 'active' THEN RETURN NEW; END IF;
  IF NEW.client_id IS NULL THEN RETURN NEW; END IF;

  IF EXISTS (
    SELECT 1 FROM public.notifications
    WHERE user_id = NEW.client_id AND type = 'guard'
      AND title = 'Campaigns Resumed ✅'
      AND created_at > now() - interval '30 seconds'
  ) THEN RETURN NEW; END IF;

  SELECT full_name, org_id INTO v_client_name, v_org_id
  FROM public.profiles WHERE user_id = NEW.client_id LIMIT 1;

  -- Client notification with resumed highlight
  INSERT INTO public.notifications (user_id, title, body, type, link, org_id)
  VALUES (
    NEW.client_id,
    'Campaigns Resumed ✅',
    'Your campaigns have been resumed after balance top-up.',
    'guard',
    '/dashboard?highlight=resumed',
    v_org_id
  );

  -- Admin notifications with client detail + automation tab
  FOR v_admin IN
    SELECT ur.user_id FROM public.user_roles ur
    JOIN public.profiles p ON p.user_id = ur.user_id
    WHERE ur.role = 'admin' AND (v_org_id IS NULL OR p.org_id = v_org_id)
  LOOP
    INSERT INTO public.notifications (user_id, title, body, type, link, org_id)
    VALUES (
      v_admin.user_id,
      'Campaigns Resumed',
      COALESCE(v_client_name, 'Client') || '''s campaigns auto-resumed after deposit.',
      'guard',
      '/admin/clients/' || NEW.client_id || '?tab=automation',
      v_org_id
    );
  END LOOP;
  RETURN NEW;
END;
$function$;

-- Update notify_on_payment_request_created with highlight param
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
  SELECT full_name, org_id INTO v_client_name, v_org_id
  FROM public.profiles WHERE user_id = NEW.client_id LIMIT 1;

  FOR v_admin IN
    SELECT ur.user_id FROM public.user_roles ur
    JOIN public.profiles p ON p.user_id = ur.user_id
    WHERE ur.role = 'admin' AND (v_org_id IS NULL OR p.org_id = v_org_id)
  LOOP
    INSERT INTO public.notifications (user_id, title, body, type, link, org_id)
    VALUES (
      v_admin.user_id,
      'New Payment Request',
      COALESCE(v_client_name, 'A client') || ' submitted ৳' || NEW.amount_bdt::text || ' via ' || NEW.payment_method::text,
      'payment',
      '/admin/payment-requests?highlight=' || NEW.id::text,
      v_org_id
    );
  END LOOP;
  RETURN NEW;
END;
$function$;

-- Update notify_on_payment_status_change with highlight param
CREATE OR REPLACE FUNCTION public.notify_on_payment_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('approved', 'rejected') THEN RETURN NEW; END IF;

  INSERT INTO public.notifications (user_id, title, body, type, link, org_id)
  VALUES (
    NEW.client_id,
    CASE WHEN NEW.status = 'approved' THEN 'Payment Approved ✅' ELSE 'Payment Rejected ❌' END,
    CASE WHEN NEW.status = 'approved'
      THEN '৳' || NEW.amount_bdt::text || ' approved → $' || COALESCE(NEW.final_amount_usd::text, '0')
      ELSE '৳' || NEW.amount_bdt::text || ' was rejected' || COALESCE('. Note: ' || NEW.admin_note, '')
    END,
    'payment',
    '/dashboard/wallet?highlight=' || NEW.id::text,
    NEW.org_id
  );
  RETURN NEW;
END;
$function$;

-- Update notify_on_campaign_request with highlight param
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
BEGIN
  SELECT full_name, org_id INTO v_client_name, v_org_id
  FROM public.profiles WHERE user_id = NEW.client_id LIMIT 1;

  IF TG_OP = 'INSERT' THEN
    FOR v_admin IN
      SELECT ur.user_id FROM public.user_roles ur
      JOIN public.profiles p ON p.user_id = ur.user_id
      WHERE ur.role = 'admin' AND (v_org_id IS NULL OR p.org_id = v_org_id)
    LOOP
      INSERT INTO public.notifications (user_id, title, body, type, link, org_id)
      VALUES (
        v_admin.user_id,
        'New Campaign Request',
        COALESCE(v_client_name, 'A client') || ' requested a ' || NEW.platform::text || ' campaign ($' || NEW.budget_usd::text || ')',
        'campaign',
        '/admin/orders?highlight=' || NEW.id::text,
        v_org_id
      );
    END LOOP;
  ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    IF NEW.status IN ('approved', 'rejected') THEN
      INSERT INTO public.notifications (user_id, title, body, type, link, org_id)
      VALUES (
        NEW.client_id,
        CASE WHEN NEW.status = 'approved' THEN 'Campaign Approved ✅' ELSE 'Campaign Rejected ❌' END,
        'Your ' || NEW.platform::text || ' campaign request was ' || NEW.status::text
          || CASE WHEN NEW.status = 'rejected' AND NEW.rejection_reason IS NOT NULL
            THEN '. Reason: ' || NEW.rejection_reason ELSE '' END,
        'campaign',
        '/dashboard/campaigns?highlight=' || NEW.id::text,
        v_org_id
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
