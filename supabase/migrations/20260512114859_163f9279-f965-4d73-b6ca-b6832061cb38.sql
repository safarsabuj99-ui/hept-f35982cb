
-- 1. api_integrations: add org filter for managers
DROP POLICY IF EXISTS manager_system_api_integrations ON public.api_integrations;
CREATE POLICY manager_system_api_integrations ON public.api_integrations
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(),'manager')
    AND has_permission(auth.uid(),'can_configure_system')
    AND org_id = get_user_org_id(auth.uid())
  );

-- 2. settings: org-scoped read + platform defaults only
DROP POLICY IF EXISTS authenticated_read_settings ON public.settings;
CREATE POLICY authenticated_read_settings ON public.settings
  FOR SELECT TO authenticated
  USING (
    org_id IS NULL
    OR org_id = get_user_org_id(auth.uid())
  );

-- 3. liquid_fund_loans / liquid_fund_loan_returns: require admin role
DROP POLICY IF EXISTS "Admins can manage liquid_fund_loans" ON public.liquid_fund_loans;
CREATE POLICY admin_manage_liquid_fund_loans ON public.liquid_fund_loans
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') AND org_id = get_user_org_id(auth.uid()))
  WITH CHECK (has_role(auth.uid(),'admin') AND org_id = get_user_org_id(auth.uid()));

DROP POLICY IF EXISTS "Admins can manage liquid_fund_loan_returns" ON public.liquid_fund_loan_returns;
CREATE POLICY admin_manage_liquid_fund_loan_returns ON public.liquid_fund_loan_returns
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') AND org_id = get_user_org_id(auth.uid()))
  WITH CHECK (has_role(auth.uid(),'admin') AND org_id = get_user_org_id(auth.uid()));

-- 4. sync_account_stats / sync_integrity_alerts: drop public USING(true) policies, retarget reads
DROP POLICY IF EXISTS "Service role full access stats" ON public.sync_account_stats;
DROP POLICY IF EXISTS "Org members can view sync stats" ON public.sync_account_stats;
CREATE POLICY org_members_view_sync_stats ON public.sync_account_stats
  FOR SELECT TO authenticated
  USING (org_id = get_user_org_id(auth.uid()));

DROP POLICY IF EXISTS "Service role full access alerts" ON public.sync_integrity_alerts;
DROP POLICY IF EXISTS "Org members view integrity alerts" ON public.sync_integrity_alerts;
CREATE POLICY org_members_view_sync_integrity_alerts ON public.sync_integrity_alerts
  FOR SELECT TO authenticated
  USING (org_id = get_user_org_id(auth.uid()));

-- 5. subscription-proofs: tighten anon and authenticated write paths
DROP POLICY IF EXISTS anon_upload_subscription_proofs ON storage.objects;
CREATE POLICY anon_upload_signup_proofs ON storage.objects
  FOR INSERT TO anon
  WITH CHECK (
    bucket_id = 'subscription-proofs'
    AND (storage.foldername(name))[1] = 'signup'
  );

DROP POLICY IF EXISTS admin_upload_subscription_proofs ON storage.objects;
CREATE POLICY org_upload_subscription_proofs ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'subscription-proofs'
    AND (storage.foldername(name))[1] = get_user_org_id(auth.uid())::text
  );

-- 6. brand-assets: scope writes/updates/deletes to own org folder
DROP POLICY IF EXISTS "Auth upload brand assets" ON storage.objects;
DROP POLICY IF EXISTS "Auth update brand assets" ON storage.objects;
DROP POLICY IF EXISTS "Auth delete brand assets" ON storage.objects;

CREATE POLICY org_upload_brand_assets ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'brand-assets'
    AND (storage.foldername(name))[1] = get_user_org_id(auth.uid())::text
  );

CREATE POLICY org_update_brand_assets ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'brand-assets'
    AND (storage.foldername(name))[1] = get_user_org_id(auth.uid())::text
  )
  WITH CHECK (
    bucket_id = 'brand-assets'
    AND (storage.foldername(name))[1] = get_user_org_id(auth.uid())::text
  );

CREATE POLICY org_delete_brand_assets ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'brand-assets'
    AND (storage.foldername(name))[1] = get_user_org_id(auth.uid())::text
  );

-- 7. Block clients from modifying their own privilege fields
CREATE OR REPLACE FUNCTION public.prevent_privilege_self_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND auth.uid() = NEW.user_id
     AND NOT (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'platform_owner'))
     AND (
       COALESCE(NEW.is_super_admin, false) IS DISTINCT FROM COALESCE(OLD.is_super_admin, false)
       OR NEW.permissions IS DISTINCT FROM OLD.permissions
       OR NEW.org_id IS DISTINCT FROM OLD.org_id
     )
  THEN
    RAISE EXCEPTION 'Cannot modify privilege fields on own profile';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_privilege_self_update ON public.profiles;
CREATE TRIGGER trg_prevent_privilege_self_update
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_privilege_self_update();
