
CREATE TABLE public.plan_upgrade_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  current_plan text NOT NULL,
  requested_plan text NOT NULL,
  requested_billing_cycle text NOT NULL DEFAULT 'monthly',
  status text NOT NULL DEFAULT 'pending',
  admin_note text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.plan_upgrade_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_admin_manage_own_upgrade_requests"
  ON public.plan_upgrade_requests FOR ALL TO authenticated
  USING (org_id = get_user_org_id(auth.uid()))
  WITH CHECK (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "platform_owner_all_upgrade_requests"
  ON public.plan_upgrade_requests FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'platform_owner'::app_role))
  WITH CHECK (has_role(auth.uid(), 'platform_owner'::app_role));
