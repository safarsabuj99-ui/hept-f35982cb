
-- 1. Add parent-level columns to campaign_requests
ALTER TABLE public.campaign_requests
  ADD COLUMN IF NOT EXISTS title text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS total_budget_usd numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS task_count integer NOT NULL DEFAULT 0;

-- 2. Create campaign_task_status enum
DO $$ BEGIN
  CREATE TYPE public.campaign_task_status AS ENUM ('pending', 'processing', 'completed', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3. Create campaign_tasks table
CREATE TABLE public.campaign_tasks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id uuid NOT NULL REFERENCES public.campaign_requests(id) ON DELETE CASCADE,
  platform public.ad_platform NOT NULL,
  objective public.campaign_objective NOT NULL,
  budget_usd numeric NOT NULL DEFAULT 0,
  creative_link text NOT NULL DEFAULT '',
  ad_caption text,
  quantity integer NOT NULL DEFAULT 1,
  status public.campaign_task_status NOT NULL DEFAULT 'pending',
  rejection_reason text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- 4. Enable RLS
ALTER TABLE public.campaign_tasks ENABLE ROW LEVEL SECURITY;

-- 5. RLS policies
CREATE POLICY "admin_all_campaign_tasks"
  ON public.campaign_tasks FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "client_read_own_campaign_tasks"
  ON public.campaign_tasks FOR SELECT
  TO authenticated
  USING (
    request_id IN (
      SELECT id FROM public.campaign_requests WHERE client_id = auth.uid()
    )
  );

CREATE POLICY "client_insert_own_campaign_tasks"
  ON public.campaign_tasks FOR INSERT
  TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'client'::app_role)
    AND request_id IN (
      SELECT id FROM public.campaign_requests WHERE client_id = auth.uid()
    )
  );

CREATE POLICY "manager_read_campaign_tasks"
  ON public.campaign_tasks FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'manager'::app_role)
    AND request_id IN (
      SELECT id FROM public.campaign_requests
      WHERE client_id IN (SELECT get_managed_client_ids(auth.uid()))
    )
  );

-- 6. Index for fast lookups
CREATE INDEX idx_campaign_tasks_request_id ON public.campaign_tasks(request_id);

-- 7. Update notification trigger to use title/task_count
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
    -- Build body based on new or legacy format
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
    IF NEW.status IN ('approved', 'rejected') THEN
      INSERT INTO public.notifications (user_id, title, body, type, link, org_id, priority)
      VALUES (
        NEW.client_id,
        CASE WHEN NEW.status = 'approved' THEN 'Campaign Approved ✅' ELSE 'Campaign Rejected ❌' END,
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

-- 8. Backfill existing rows: set task_count=1 and total_budget_usd=budget_usd for legacy
UPDATE public.campaign_requests
SET task_count = 0, total_budget_usd = budget_usd
WHERE task_count = 0 AND budget_usd > 0;
