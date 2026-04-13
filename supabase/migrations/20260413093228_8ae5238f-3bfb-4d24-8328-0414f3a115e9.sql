-- Fix: Allow platform_owner to update settings (currently only admin can)
DROP POLICY IF EXISTS "admin_write_settings" ON public.settings;
DROP POLICY IF EXISTS "admin_or_platform_write_settings" ON public.settings;

CREATE POLICY "admin_or_platform_write_settings" ON public.settings
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'platform_owner'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'platform_owner'::app_role)
  );