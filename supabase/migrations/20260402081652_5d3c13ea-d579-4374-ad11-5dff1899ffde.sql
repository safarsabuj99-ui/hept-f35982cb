
-- 1. Create notification type enum
CREATE TYPE public.notification_type AS ENUM ('payment', 'guard', 'campaign', 'system');

-- 2. Create notifications table
CREATE TABLE public.notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  type public.notification_type NOT NULL DEFAULT 'system',
  is_read boolean NOT NULL DEFAULT false,
  link text,
  org_id uuid REFERENCES public.organizations(id),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- 3. Performance index
CREATE INDEX idx_notifications_user_read_created
  ON public.notifications (user_id, is_read, created_at DESC);

-- 4. Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- 5. RLS policies
CREATE POLICY "users_read_own_notifications"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "users_update_own_notifications"
  ON public.notifications FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "users_delete_own_notifications"
  ON public.notifications FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "service_insert_notifications"
  ON public.notifications FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- 6. Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- 7. Trigger: payment_requests INSERT → notify admins
CREATE OR REPLACE FUNCTION public.notify_on_payment_request_created()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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
      '/admin/payments',
      v_org_id
    );
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_payment_request_created ON public.payment_requests;
CREATE TRIGGER trg_notify_payment_request_created
  AFTER INSERT ON public.payment_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_payment_request_created();

-- 8. Trigger: payment_requests UPDATE (approved/rejected) → notify client
CREATE OR REPLACE FUNCTION public.notify_on_payment_status_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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
    '/dashboard/wallet',
    NEW.org_id
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_payment_status_change ON public.payment_requests;
CREATE TRIGGER trg_notify_payment_status_change
  AFTER UPDATE ON public.payment_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_payment_status_change();

-- 9. Trigger: campaigns guard_paused → notify client + admins
CREATE OR REPLACE FUNCTION public.notify_on_guard_pause()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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

  -- Count how many campaigns just got paused for this client (deduplicate)
  SELECT count(*) INTO v_count FROM public.campaigns
  WHERE client_id = NEW.client_id AND status = 'guard_paused';

  -- Only notify once per batch: check if we already notified in last 30 seconds
  IF EXISTS (
    SELECT 1 FROM public.notifications
    WHERE user_id = NEW.client_id AND type = 'guard'
      AND title = 'Campaigns Paused ⚠️'
      AND created_at > now() - interval '30 seconds'
  ) THEN RETURN NEW; END IF;

  -- Notify client
  INSERT INTO public.notifications (user_id, title, body, type, link, org_id)
  VALUES (
    NEW.client_id,
    'Campaigns Paused ⚠️',
    v_count || ' campaign(s) paused due to low balance. Add funds to resume.',
    'guard',
    '/dashboard/wallet',
    v_org_id
  );

  -- Notify admins
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
      '/admin/clients',
      v_org_id
    );
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_guard_pause ON public.campaigns;
CREATE TRIGGER trg_notify_guard_pause
  AFTER UPDATE ON public.campaigns
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_guard_pause();

-- 10. Trigger: campaigns resume from guard_paused → notify client + admins
CREATE OR REPLACE FUNCTION public.notify_on_guard_resume()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_client_name text;
  v_org_id uuid;
  v_admin record;
BEGIN
  IF OLD.status NOT IN ('guard_paused', 'paused') THEN RETURN NEW; END IF;
  IF NEW.status <> 'active' THEN RETURN NEW; END IF;
  IF NEW.client_id IS NULL THEN RETURN NEW; END IF;

  -- Deduplicate: only once per 30s
  IF EXISTS (
    SELECT 1 FROM public.notifications
    WHERE user_id = NEW.client_id AND type = 'guard'
      AND title = 'Campaigns Resumed ✅'
      AND created_at > now() - interval '30 seconds'
  ) THEN RETURN NEW; END IF;

  SELECT full_name, org_id INTO v_client_name, v_org_id
  FROM public.profiles WHERE user_id = NEW.client_id LIMIT 1;

  INSERT INTO public.notifications (user_id, title, body, type, link, org_id)
  VALUES (
    NEW.client_id,
    'Campaigns Resumed ✅',
    'Your campaigns have been resumed after balance top-up.',
    'guard',
    '/dashboard',
    v_org_id
  );

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
      '/admin/clients',
      v_org_id
    );
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_guard_resume ON public.campaigns;
CREATE TRIGGER trg_notify_guard_resume
  AFTER UPDATE ON public.campaigns
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_guard_resume();

-- 11. Trigger: campaign_requests INSERT → notify admins, UPDATE status → notify client
CREATE OR REPLACE FUNCTION public.notify_on_campaign_request()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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
        '/admin/orders',
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
        '/dashboard/campaigns',
        v_org_id
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_campaign_request ON public.campaign_requests;
CREATE TRIGGER trg_notify_campaign_request
  AFTER INSERT OR UPDATE ON public.campaign_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_campaign_request();
