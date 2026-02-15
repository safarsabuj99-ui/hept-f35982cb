
-- Add permissions JSONB and is_super_admin to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS permissions jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_super_admin boolean NOT NULL DEFAULT false;

-- Create security-definer function to check granular permissions
CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _permission_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = _user_id
      AND (is_super_admin = true OR (permissions->>_permission_key)::boolean = true)
  )
$$;

-- Update RLS on usd_purchases: allow managers with can_manage_finance
CREATE POLICY "manager_finance_usd_purchases"
ON public.usd_purchases
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'manager'::app_role)
  AND has_permission(auth.uid(), 'can_manage_finance')
);

-- Update RLS on agency_expenses: allow managers with can_manage_finance
CREATE POLICY "manager_finance_agency_expenses"
ON public.agency_expenses
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'manager'::app_role)
  AND has_permission(auth.uid(), 'can_manage_finance')
);

-- Update RLS on api_integrations: allow managers with can_configure_system
CREATE POLICY "manager_system_api_integrations"
ON public.api_integrations
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'manager'::app_role)
  AND has_permission(auth.uid(), 'can_configure_system')
);

-- Allow managers to read settings if they have can_manage_finance or can_configure_system
-- (settings already has a public read policy, so no change needed)
