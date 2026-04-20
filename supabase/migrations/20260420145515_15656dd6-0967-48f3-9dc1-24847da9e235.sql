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
BEGIN
  SELECT full_name, org_id INTO v_client_name, v_org_id
  FROM public.profiles WHERE user_id = NEW.client_id LIMIT 1;

  IF TG_OP = 'INSERT' THEN
    IF NEW.task_count > 0 THEN
      v_body := COALESCE(v_client_name, 'A client') || ' submitted "' || COALESCE(NULLIF(NEW.title, ''), 'Untitled') || '" with ' || NEW.task_count || ' task(s) ($' || NEW.total_budget_usd::text || ')';
    ELSE
      v_body := COALESCE(v_client_name, 'A client') || ' requested a ' || NEW.platform::text || ' campaign ($' || NEW.budget_usd::text || ')';
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
        'Your campaign request "' || COALESCE(NULLIF(NEW.title, ''), NEW.platform::text) || '" was ' || NEW.status::text
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
$function$;