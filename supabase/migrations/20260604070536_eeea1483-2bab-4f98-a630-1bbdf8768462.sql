
-- 1) ai_provider_configs: hide API keys/oauth tokens from the client.
--    Add a generated boolean so UI can still show "key set / not set".
ALTER TABLE public.ai_provider_configs
  ADD COLUMN IF NOT EXISTS api_key_present boolean
  GENERATED ALWAYS AS (api_key IS NOT NULL AND length(api_key) > 0) STORED;

ALTER TABLE public.ai_provider_configs
  ADD COLUMN IF NOT EXISTS oauth_token_present boolean
  GENERATED ALWAYS AS (oauth_token IS NOT NULL AND length(oauth_token) > 0) STORED;

-- Revoke column-level SELECT on sensitive fields from client roles.
-- Edge functions using the service-role key still have full access.
REVOKE SELECT (api_key, oauth_token) ON public.ai_provider_configs FROM authenticated;
REVOKE SELECT (api_key, oauth_token) ON public.ai_provider_configs FROM anon;

-- Re-affirm column SELECT on the safe columns so the existing RLS policy
-- still returns rows for admins (PG grants SELECT on table by default; we
-- only removed it on two specific columns above).
GRANT SELECT (
  id, org_id, provider, default_model, is_active,
  monthly_budget_usd, usage_this_month_usd, usage_month,
  created_at, updated_at, api_key_present, oauth_token_present
) ON public.ai_provider_configs TO authenticated;

-- 2) plan_upgrade_requests: only org admins (and platform owners) may
--    create/modify upgrade requests. Replace the over-permissive policy.
DROP POLICY IF EXISTS org_admin_manage_own_upgrade_requests ON public.plan_upgrade_requests;

CREATE POLICY org_admin_manage_own_upgrade_requests
  ON public.plan_upgrade_requests
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    AND org_id = get_user_org_id(auth.uid())
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    AND org_id = get_user_org_id(auth.uid())
  );

-- 3) settings: tighten authenticated read to the same explicit allowlist
--    as anon, plus org-scoped rows. Prevents future global settings from
--    leaking cross-tenant.
DROP POLICY IF EXISTS authenticated_read_settings ON public.settings;

CREATE POLICY authenticated_read_settings
  ON public.settings
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    (org_id IS NULL AND key = ANY (ARRAY[
      'trial_on_self_signup',
      'default_trial_days',
      'default_grace_period_days',
      'enable_legacy_perf_write'
    ]))
    OR (org_id = get_user_org_id(auth.uid()))
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'platform_owner'::app_role)
  );
