

## Multi-Tenant Data Isolation Hardening — Close All Org-Leak Gaps

### Context (verified via DB)
2 organizations exist on the platform. All current agency finance rows (accounts, expenses, USD purchases, withdrawals, transfers) belong to ONE org — but several RLS policies, table defaults, and frontend queries let the **second org read the first org's data** (and vice versa). This plan closes every gap end-to-end.

---

### Verified Leak Inventory

| # | Surface | Current behavior | Risk |
|---|---|---|---|
| 1 | `agency_accounts` SELECT | Clients & finance-managers from ANY org see ALL active accounts | **HIGH** — cross-tenant bank info |
| 2 | `agency_expenses` SELECT | Finance-managers from ANY org see ALL agencies' expenses | **HIGH** |
| 3 | `cash_withdrawals` / `cash_withdrawal_returns` SELECT | Finance-managers across orgs | **HIGH** |
| 4 | `fund_transfers` SELECT | Finance-managers across orgs | **HIGH** |
| 5 | `settings` SELECT (`anon_read_settings`, `read_settings`) | `qual:true` — anyone reads everyone's settings (incl. agency-specific overrides) | **HIGH** |
| 6 | `document_acceptances` | Only `user_id = auth.uid()` checked — no org scope (low risk because user_id self-scopes, but `org_id` should be enforced for admin views) | LOW |
| 7 | `set_org_id_from_auth` trigger (used by `agency_accounts`, `agency_expenses`, `cash_withdrawals`, `fund_transfers`, `liquid_fund_entries`, `payment_requests`, `transactions`) | Falls back to first organization when `auth.uid()` is null (service-role context) — same defect we just fixed for `ad_accounts` | **MED** (silent mis-tagging risk) |
| 8 | `set_org_id_safety_net` (acquisition_costs, data_export_requests, feature_usage_events, organization_subscriptions, overage_charges, plan_change_log, plan_upgrade_requests, payment_gateway_config, platform_costs, platform_invoices, referral_codes, sla_metrics, tenant_health_scores, usage_metering_logs) | Same fallback defect | **MED** |
| 9 | `usePrefetch.ts /admin/finance` query | Fetches active accounts for any client too (relies on broken RLS) | mitigated once #1 is fixed |

(Tables already correctly isolated: `transactions`, `campaigns`, `ad_accounts`, `daily_metrics`, `payment_requests`, `usd_inventory_snapshots`, `usd_purchases`, `usd_manual_spends`, `client_notices`, `audit_logs`, `notifications`, etc. — `admin_all_*` policies all enforce `org_id = get_user_org_id(auth.uid())`.)

---

### Fix Plan (one migration, no frontend rewrites needed)

**Layer 1 — Tighten the 5 leaky SELECT policies**

Drop and recreate with explicit org scope:

```sql
-- agency_accounts: clients + finance-managers can only see THEIR org's accounts
DROP POLICY "client_read_active_agency_accounts" ON agency_accounts;
DROP POLICY "manager_finance_read_agency_accounts" ON agency_accounts;
CREATE POLICY "client_read_org_agency_accounts" ON agency_accounts FOR SELECT
  USING (has_role(auth.uid(),'client') AND is_active = true
         AND org_id = get_user_org_id(auth.uid()));
CREATE POLICY "manager_finance_read_org_agency_accounts" ON agency_accounts FOR SELECT
  USING (has_role(auth.uid(),'manager') AND has_permission(auth.uid(),'can_manage_finance')
         AND org_id = get_user_org_id(auth.uid()));

-- Same shape for: agency_expenses, cash_withdrawals, cash_withdrawal_returns, fund_transfers
```

**Layer 2 — Fix the `settings` table (split global vs per-org)**

`settings` currently mixes platform-global keys (`default_trial_days`, `trial_on_self_signup`, `default_grace_period_days`) with potentially per-org keys (`exchange_rate`, future agency overrides). Solution:

- Keep `settings` as a **platform-global** table — restrict SELECT to authenticated users (no anon), and explicitly only allow specific allow-listed keys to be readable. Drop both leaky `qual:true` policies.
- Replace with: `read_settings_authenticated` for authenticated users only (the keys here — exchange rate, trial config, etc. — are non-sensitive operational config, but anonymous read is unnecessary).

```sql
DROP POLICY "anon_read_settings" ON settings;
DROP POLICY "read_settings" ON settings;
CREATE POLICY "authenticated_read_settings" ON settings FOR SELECT TO authenticated USING (true);
-- Keep anon access ONLY for the keys public signup pages need:
CREATE POLICY "anon_read_signup_settings" ON settings FOR SELECT TO anon
  USING (key IN ('trial_on_self_signup','default_trial_days'));
```

(Signup/CreateAgency keep working; agency-specific data is not stored here.)

**Layer 3 — Harden `set_org_id_from_auth` and `set_org_id_safety_net` (defense in depth)**

Both currently fall back to `SELECT id FROM organizations LIMIT 1` when `auth.uid()` is null — same defect that caused yesterday's `ad_accounts` bug and will silently mis-tag any future service-role insert.

Rewrite both to **RAISE EXCEPTION** instead of arbitrary fallback:

```sql
CREATE OR REPLACE FUNCTION set_org_id_from_auth() RETURNS trigger AS $$
BEGIN
  IF NEW.org_id IS NULL THEN
    NEW.org_id := get_user_org_id(auth.uid());
  END IF;
  IF NEW.org_id IS NULL THEN
    RAISE EXCEPTION 'org_id required: pass it explicitly when inserting from service role (table %)', TG_TABLE_NAME;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path=public;
```

Same for `set_org_id_safety_net`. This guarantees no future code path can create cross-tenant rows by accident.

**Layer 4 — Frontend (no changes needed)**

Once RLS is correct, every existing `.from("agency_accounts").select()` / `.from("agency_expenses").select()` automatically returns only the caller's org rows. No app-level filter needed. The `usePrefetch.ts` query and Cash Flow / Wallet / Expense pages immediately become tenant-correct.

**Layer 5 — One-shot data integrity check**

After applying, run a verification query confirming every org-bearing table has zero NULL `org_id` rows:
```sql
SELECT 'agency_accounts' AS t, count(*) FROM agency_accounts WHERE org_id IS NULL
UNION ALL SELECT 'agency_expenses', count(*) FROM agency_expenses WHERE org_id IS NULL
-- ... for all 50 org-bearing tables
```
If any rows are NULL, repair them by deriving from `created_by`'s profile.

---

### Files Changed

| File | Change |
|---|---|
| New SQL migration | (a) Drop + recreate 10 leaky SELECT policies on 5 tables with org_id scope; (b) replace `settings` `qual:true` policies with authenticated + scoped-anon variants; (c) harden `set_org_id_from_auth` and `set_org_id_safety_net` to RAISE on NULL instead of falling back to first org; (d) verification query in comments |

Zero frontend changes. Zero schema changes. Pure security hardening.

---

### Why this is bulletproof

- **No more cross-tenant reads** — every multi-tenant SELECT policy now enforces `org_id = get_user_org_id(auth.uid())`.
- **No more silent mis-tagging on writes** — service-role inserters MUST pass `org_id` explicitly or the insert fails loudly.
- **Public signup keeps working** — only specific platform-global setting keys remain anon-readable.
- **Backward-compatible** — existing data is unchanged; only future writes/reads are tightened.
- **Self-auditing** — verification query in the migration confirms no orphan NULL `org_id` rows survived.

### Build Time
~7 minutes. One migration. Zero breaking changes for legitimate users (each agency simply stops seeing the other agency's data — which is the goal).

