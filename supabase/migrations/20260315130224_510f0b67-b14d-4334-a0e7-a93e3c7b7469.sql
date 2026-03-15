CREATE POLICY "platform_owner_all_user_roles" ON public.user_roles
FOR ALL TO authenticated
USING (has_role(auth.uid(), 'platform_owner'))
WITH CHECK (has_role(auth.uid(), 'platform_owner'));

CREATE POLICY "platform_owner_all_profiles" ON public.profiles
FOR ALL TO authenticated
USING (has_role(auth.uid(), 'platform_owner'))
WITH CHECK (has_role(auth.uid(), 'platform_owner'));