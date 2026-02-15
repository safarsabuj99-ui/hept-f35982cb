
-- Create manager_permissions table
CREATE TABLE public.manager_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  can_view_dashboard boolean NOT NULL DEFAULT true,
  can_view_transactions boolean NOT NULL DEFAULT true,
  can_add_funds boolean NOT NULL DEFAULT true,
  can_log_spend boolean NOT NULL DEFAULT true,
  can_edit_clients boolean NOT NULL DEFAULT false,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.manager_permissions ENABLE ROW LEVEL SECURITY;

-- Admin can do everything
CREATE POLICY "admin_all_permissions"
ON public.manager_permissions
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Managers can read their own permissions
CREATE POLICY "manager_read_own_permissions"
ON public.manager_permissions
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Trigger for updated_at
CREATE TRIGGER update_manager_permissions_updated_at
BEFORE UPDATE ON public.manager_permissions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
