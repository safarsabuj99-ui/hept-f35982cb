
-- Affiliate links: add explicit SELECT for owners
DROP POLICY IF EXISTS "affiliate_links_own_select" ON public.affiliate_links;
CREATE POLICY "affiliate_links_own_select" ON public.affiliate_links
FOR SELECT TO authenticated
USING (affiliate_id IN (SELECT id FROM public.affiliates WHERE user_id = auth.uid()));

-- Data export requests: restrict to admins
DROP POLICY IF EXISTS "Org admins manage own export requests" ON public.data_export_requests;
CREATE POLICY "Org admins manage own export requests" ON public.data_export_requests
FOR ALL TO authenticated
USING (org_id = public.get_user_org_id(auth.uid()) AND public.has_role(auth.uid(), 'admin'::public.app_role))
WITH CHECK (org_id = public.get_user_org_id(auth.uid()) AND public.has_role(auth.uid(), 'admin'::public.app_role));

-- Payment gateway config: restrict SELECT to admins
DROP POLICY IF EXISTS "Org admins read own gateway config" ON public.payment_gateway_config;
CREATE POLICY "Org admins read own gateway config" ON public.payment_gateway_config
FOR SELECT TO authenticated
USING (org_id = public.get_user_org_id(auth.uid()) AND public.has_role(auth.uid(), 'admin'::public.app_role));

-- Usage metering logs: restrict SELECT to admins
DROP POLICY IF EXISTS "Org admins read own usage" ON public.usage_metering_logs;
CREATE POLICY "Org admins read own usage" ON public.usage_metering_logs
FOR SELECT TO authenticated
USING (org_id = public.get_user_org_id(auth.uid()) AND public.has_role(auth.uid(), 'admin'::public.app_role));
