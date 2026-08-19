CREATE OR REPLACE FUNCTION public.notify_on_guard_pause()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

  -- One notification per client per 10 minutes: a wide guard sweep must not
  -- produce dozens of urgent alerts for the same client.
  IF EXISTS (
    SELECT 1 FROM public.notifications
    WHERE type = 'guard'
      AND group_key = 'guard_pause_' || NEW.client_id::text
      AND created_at > now() - interval '10 minutes'
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