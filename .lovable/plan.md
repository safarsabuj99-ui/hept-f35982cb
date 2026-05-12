
# Security Hardening Sprint

Single migration + auth setting + minimal code change to read encrypted tokens. No feature changes.

## 1. RLS fixes (SQL migration)

### a. `api_integrations` — cross-tenant manager leak
Drop `manager_system_api_integrations`, recreate with org filter:
```sql
DROP POLICY manager_system_api_integrations ON public.api_integrations;
CREATE POLICY manager_system_api_integrations ON public.api_integrations
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(),'manager')
    AND has_permission(auth.uid(),'can_configure_system')
    AND org_id = get_user_org_id(auth.uid())
  );
```

### b. `settings` — full table exposed
Replace `authenticated_read_settings` with org-scoped + public-key allowlist:
```sql
DROP POLICY authenticated_read_settings ON public.settings;
CREATE POLICY authenticated_read_settings ON public.settings
  FOR SELECT TO authenticated
  USING (
    org_id = get_user_org_id(auth.uid())
    OR org_id IS NULL  -- platform defaults
    OR key = ANY (ARRAY['trial_on_self_signup','default_trial_days','default_grace_period_days'])
  );
```

### c. `liquid_fund_loans` / `liquid_fund_loan_returns` — missing admin role check
```sql
DROP POLICY "Admins can manage liquid_fund_loans" ON public.liquid_fund_loans;
CREATE POLICY admin_manage_liquid_fund_loans ON public.liquid_fund_loans
  FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') AND org_id = get_user_org_id(auth.uid()))
  WITH CHECK (has_role(auth.uid(),'admin') AND org_id = get_user_org_id(auth.uid()));
-- Same pattern for liquid_fund_loan_returns
```

### d. `sync_account_stats` / `sync_integrity_alerts` — public USING (true)
Service-role bypasses RLS automatically; remove the public policies:
```sql
DROP POLICY "Service role full access stats" ON public.sync_account_stats;
DROP POLICY "Service role full access alerts" ON public.sync_integrity_alerts;
```
Keep the existing org-scoped SELECT, retarget to `authenticated`:
```sql
DROP POLICY "Org members can view sync stats" ON public.sync_account_stats;
CREATE POLICY org_members_view_sync_stats ON public.sync_account_stats
  FOR SELECT TO authenticated
  USING (org_id = get_user_org_id(auth.uid()));
-- Same for sync_integrity_alerts
```

## 2. Storage bucket fixes (same migration)

### a. `subscription-proofs` — privatize + ownership
```sql
UPDATE storage.buckets SET public=false WHERE id='subscription-proofs';
DROP POLICY public_read_subscription_proofs ON storage.objects;
DROP POLICY anon_upload_subscription_proofs ON storage.objects;
DROP POLICY authenticated_read_subscription_proofs ON storage.objects;
CREATE POLICY org_read_subscription_proofs ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id='subscription-proofs'
    AND (storage.foldername(name))[1] = get_user_org_id(auth.uid())::text
  );
CREATE POLICY admin_or_owner_upload_subscription_proofs ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id='subscription-proofs'
    AND (storage.foldername(name))[1] = get_user_org_id(auth.uid())::text
  );
```
App-side: continue uploading under path `<org_id>/...`.

### b. `brand-assets` — ownership check on write/delete
```sql
DROP POLICY "Auth upload brand assets" ON storage.objects;
DROP POLICY "Auth update brand assets" ON storage.objects;
DROP POLICY "Auth delete brand assets" ON storage.objects;
CREATE POLICY org_upload_brand_assets ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id='brand-assets'
    AND (storage.foldername(name))[1] = get_user_org_id(auth.uid())::text
    AND has_role(auth.uid(),'admin')
  );
CREATE POLICY org_update_brand_assets ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id='brand-assets'
    AND (storage.foldername(name))[1] = get_user_org_id(auth.uid())::text
    AND has_role(auth.uid(),'admin')
  );
CREATE POLICY org_delete_brand_assets ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id='brand-assets'
    AND (storage.foldername(name))[1] = get_user_org_id(auth.uid())::text
    AND has_role(auth.uid(),'admin')
  );
-- Public read remains (logos are public-by-design).
```
App-side: existing uploads already use `<org_id>/...` path per BrandingTab — confirm during apply.

## 3. Realtime channel scoping
Postgres-change events already respect table RLS, but the broadcast/presence layer doesn't. Add:
```sql
CREATE POLICY realtime_org_topic_select ON realtime.messages
  FOR SELECT TO authenticated
  USING (
    -- topic format: "org:<org_id>:..."
    split_part(topic,':',1) = 'org'
    AND split_part(topic,':',2) = get_user_org_id(auth.uid())::text
  );
CREATE POLICY realtime_org_topic_insert ON realtime.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    split_part(topic,':',1) = 'org'
    AND split_part(topic,':',2) = get_user_org_id(auth.uid())::text
  );
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;
```
No app-side change needed for `postgres_changes` (already RLS-protected). Document: any future broadcast/presence channel must use `org:<org_id>:...` topic prefix.

## 4. Privilege-escalation hardening on `profiles`
Block clients from ever updating the privilege columns (defense-in-depth; admin/platform_owner can still write):
```sql
CREATE OR REPLACE FUNCTION public.prevent_privilege_self_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF auth.uid() = NEW.user_id
     AND NOT (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'platform_owner'))
     AND (
       NEW.is_super_admin IS DISTINCT FROM OLD.is_super_admin
       OR NEW.permissions IS DISTINCT FROM OLD.permissions
       OR NEW.org_id IS DISTINCT FROM OLD.org_id
     )
  THEN
    RAISE EXCEPTION 'Cannot modify privilege fields on own profile';
  END IF;
  RETURN NEW;
END;$$;
CREATE TRIGGER trg_prevent_privilege_self_update
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_privilege_self_update();
```
(Note: `profiles` currently has no client UPDATE policy, so this is belt-and-braces. Full migration to a `user_privileges` table is out of scope for this sprint — tracked as future work.)

## 5. API token encryption at rest (Vault)
```sql
-- Add encrypted column alongside existing api_token (keep both during cutover)
ALTER TABLE public.api_integrations ADD COLUMN api_token_encrypted text;

-- Helper functions wrapping pgsodium/Vault (project has Vault enabled by default)
CREATE OR REPLACE FUNCTION public.encrypt_api_token(p_plain text)
RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path=public,vault AS $$
  SELECT vault.create_secret(p_plain)::text;
$$;
REVOKE EXECUTE ON FUNCTION public.encrypt_api_token(text) FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.read_api_token(p_integration_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,vault AS $$
DECLARE v_secret_id text; v_org uuid;
BEGIN
  SELECT api_token_encrypted, org_id INTO v_secret_id, v_org
  FROM public.api_integrations WHERE id=p_integration_id;
  IF v_org <> get_user_org_id(auth.uid())
     AND NOT has_role(auth.uid(),'platform_owner') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE id=v_secret_id::uuid);
END;$$;
REVOKE EXECUTE ON FUNCTION public.read_api_token(uuid) FROM anon;
```
Backfill: one-shot script (run via service-role edge function) reads `api_token`, writes encrypted, nulls plaintext. After verification a follow-up migration drops `api_token`. Edge functions (`sync-fast-lane`, `sync-deep-dive`, etc.) switch from `select api_token` to `select read_api_token(id)`. **This step is intentionally staged** — included in the plan but executed after the RLS migration is verified, to avoid breaking sync.

## 6. Auth: enable HIBP
Call `configure_auth` with `password_hibp_enabled=true` (other flags unchanged).

## 7. SECURITY DEFINER & permissive-RLS lints (the ~90 warns)
Bulk pass on the same migration:
- For every `SECURITY DEFINER` function in `public` not meant to be called by the client: `REVOKE EXECUTE ... FROM anon;` (keep `authenticated` only where needed).
- Audit each remaining `USING (true)` UPDATE/DELETE/INSERT policy from the linter list and tighten with `org_id = get_user_org_id(auth.uid())` or a role check. Generated dynamically from `pg_policies` during the apply step; the final SQL list will be in the migration.

## 8. Verification

After migration runs:
1. Re-run `supabase--linter` — all critical errors should be 0; warns should drop sharply.
2. Re-run `security--run_security_scan` — same.
3. Smoke test as: client (cannot read settings of another org), manager (cannot read other org's API tokens), admin upload of brand asset, deposit proof upload + read, Realtime subscribe with wrong org topic = denied.

## Out of scope
- Moving `is_super_admin` / `permissions` to a separate `user_privileges` table (tracked as follow-up; trigger above mitigates immediate risk).
- Replacing SSLCommerz / wiring Stripe — separate "payments live" sprint.
- Legal pages, email DKIM, GDPR delete — separate launch checklist.
- Any UI/feature change.

## Files touched
- 1 new migration (all SQL above).
- `configure_auth` call (no file).
- Edge functions reading `api_token` → swap to `read_api_token(id)` RPC after backfill (staged step 5).
