
-- Step 1: Add priority and group_key columns to notifications
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS group_key text;

CREATE INDEX IF NOT EXISTS idx_notifications_priority ON public.notifications (priority);
CREATE INDEX IF NOT EXISTS idx_notifications_group_key ON public.notifications (group_key) WHERE group_key IS NOT NULL;

-- Step 2: Create notification_preferences table
CREATE TABLE public.notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  channel text NOT NULL DEFAULT 'in_app',
  type text NOT NULL DEFAULT 'system',
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, channel, type)
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own_prefs" ON public.notification_preferences
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "users_update_own_prefs" ON public.notification_preferences
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "users_insert_own_prefs" ON public.notification_preferences
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "users_delete_own_prefs" ON public.notification_preferences
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Seed default preferences on new profile creation
CREATE OR REPLACE FUNCTION public.seed_notification_preferences()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notification_preferences (user_id, channel, type, enabled)
  VALUES
    (NEW.user_id, 'in_app', 'payment', true),
    (NEW.user_id, 'in_app', 'guard', true),
    (NEW.user_id, 'in_app', 'campaign', true),
    (NEW.user_id, 'in_app', 'system', true),
    (NEW.user_id, 'push', 'payment', true),
    (NEW.user_id, 'push', 'guard', true),
    (NEW.user_id, 'push', 'campaign', true),
    (NEW.user_id, 'push', 'system', true)
  ON CONFLICT (user_id, channel, type) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_seed_notification_prefs
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.seed_notification_preferences();

-- Step 3: Update trigger functions with priority

-- notify_on_guard_pause: urgent priority
CREATE OR REPLACE FUNCTION public.notify_on_guard_pause()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

-- notify_on_guard_resume: normal priority
CREATE OR REPLACE FUNCTION public.notify_on_guard_resume()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  INSERT INTO public.notifications (user_id, title, body, type, link, org_id, priority)
  VALUES (
    NEW.client_id,
    'Campaigns Resumed ✅',
    'Your campaigns have been resumed after balance top-up.',
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
      'Campaigns Resumed',
      COALESCE(v_client_name, 'Client') || '''s campaigns auto-resumed after deposit.',
      'guard',
      '/admin/clients/' || NEW.client_id || '?tab=automation',
      v_org_id,
      'normal'
    );
  END LOOP;
  RETURN NEW;
END;
$$;

-- notify_on_payment_request_created: high priority
CREATE OR REPLACE FUNCTION public.notify_on_payment_request_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    INSERT INTO public.notifications (user_id, title, body, type, link, org_id, priority, group_key)
    VALUES (
      v_admin.user_id,
      'New Payment Request',
      COALESCE(v_client_name, 'A client') || ' submitted ৳' || NEW.amount_bdt::text || ' via ' || NEW.payment_method::text,
      'payment',
      '/admin/payment-requests?highlight=' || NEW.id::text,
      v_org_id,
      'high',
      'payment_' || NEW.client_id::text
    );
  END LOOP;
  RETURN NEW;
END;
$$;

-- notify_on_payment_status_change: normal for approved, urgent for rejected
CREATE OR REPLACE FUNCTION public.notify_on_payment_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('approved', 'rejected') THEN RETURN NEW; END IF;

  INSERT INTO public.notifications (user_id, title, body, type, link, org_id, priority)
  VALUES (
    NEW.client_id,
    CASE WHEN NEW.status = 'approved' THEN 'Payment Approved ✅' ELSE 'Payment Rejected ❌' END,
    CASE WHEN NEW.status = 'approved'
      THEN '৳' || NEW.amount_bdt::text || ' approved → $' || COALESCE(NEW.final_amount_usd::text, '0')
      ELSE '৳' || NEW.amount_bdt::text || ' was rejected' || COALESCE('. Note: ' || NEW.admin_note, '')
    END,
    'payment',
    '/dashboard/wallet?highlight=' || NEW.id::text,
    NEW.org_id,
    CASE WHEN NEW.status = 'rejected' THEN 'urgent' ELSE 'normal' END
  );
  RETURN NEW;
END;
$$;

-- notify_on_campaign_request: high for new, normal for approved, urgent for rejected
CREATE OR REPLACE FUNCTION public.notify_on_campaign_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
      INSERT INTO public.notifications (user_id, title, body, type, link, org_id, priority, group_key)
      VALUES (
        v_admin.user_id,
        'New Campaign Request',
        COALESCE(v_client_name, 'A client') || ' requested a ' || NEW.platform::text || ' campaign ($' || NEW.budget_usd::text || ')',
        'campaign',
        '/admin/orders?highlight=' || NEW.id::text,
        v_org_id,
        'high',
        'campaign_req_' || NEW.client_id::text
      );
    END LOOP;
  ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    IF NEW.status IN ('approved', 'rejected') THEN
      INSERT INTO public.notifications (user_id, title, body, type, link, org_id, priority)
      VALUES (
        NEW.client_id,
        CASE WHEN NEW.status = 'approved' THEN 'Campaign Approved ✅' ELSE 'Campaign Rejected ❌' END,
        'Your ' || NEW.platform::text || ' campaign request was ' || NEW.status::text
          || CASE WHEN NEW.status = 'rejected' AND NEW.rejection_reason IS NOT NULL
            THEN '. Reason: ' || NEW.rejection_reason ELSE '' END,
        'campaign',
        '/dashboard/campaigns?highlight=' || NEW.id::text,
        v_org_id,
        CASE WHEN NEW.status = 'rejected' THEN 'urgent' ELSE 'normal' END
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Step 4: Auto-cleanup function
CREATE OR REPLACE FUNCTION public.cleanup_old_notifications()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.notifications
  WHERE (is_read = true AND created_at < now() - interval '30 days')
     OR (is_read = false AND created_at < now() - interval '90 days');
END;
$$;

-- Schedule cleanup via pg_cron
SELECT cron.schedule(
  'cleanup-old-notifications',
  '0 3 * * *',
  $$SELECT public.cleanup_old_notifications()$$
);
