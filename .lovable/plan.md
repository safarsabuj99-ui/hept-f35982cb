

## Plan: Fix Multi-Tenant Data Isolation (Critical Security Bug)

### Problem

Every `admin_all_*` RLS policy uses `has_role(auth.uid(), 'admin')` **without filtering by `org_id`**. This means any agency admin can see ALL data from ALL agencies. When test1 agency logs in, they see MD SABUJ MIAH Agency's clients, transactions, campaigns, and everything else.

Additionally, the `get_admin_dashboard_summary` database function queries data globally without org filtering.

### Root Cause

27 tables have `admin_all_*` policies that grant full access to anyone with the `admin` role, ignoring which organization they belong to. In a SaaS system, each agency must only see its own data.

### Fix Strategy

Use the existing `get_user_org_id(auth.uid())` function to scope every admin policy to the admin's own organization.

#### 1. Database Migration — Update 27 RLS Policies

For **23 tables with `org_id` column**, replace the policy with org-scoped version:

```sql
-- Example pattern (applied to each table):
DROP POLICY "admin_all_ad_accounts" ON public.ad_accounts;
CREATE POLICY "admin_all_ad_accounts" ON public.ad_accounts
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) 
    AND org_id = get_user_org_id(auth.uid()))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) 
    AND org_id = get_user_org_id(auth.uid()));
```

Tables with `org_id` (23): `ad_account_clients`, `ad_accounts`, `agency_accounts`, `agency_expenses`, `api_integrations`, `billing_notifications`, `campaign_mappings`, `campaign_performance`, `campaign_requests`, `campaigns`, `cash_withdrawal_returns`, `cash_withdrawals`, `client_notices`, `daily_ad_spend`, `daily_metrics`, `fund_transfers`, `liquid_fund_entries`, `payment_requests`, `profiles`, `transactions`, `usd_inventory_snapshots`, `usd_purchases`

For **4 tables without `org_id`**, use indirect joins:
- `campaign_tasks` → filter via `campaign_requests.org_id`
- `guard_pause_jobs` → filter via `campaigns.org_id`
- `manager_permissions` → filter via `profiles.org_id`
- `user_roles` → filter via `profiles.org_id`
- `sync_logs` → filter via `api_integrations.org_id`

#### 2. Update Dashboard Summary Function

Modify `get_admin_dashboard_summary` to accept a `p_org_id` parameter and filter all queries (clients, spend, transactions, ad accounts) by that org.

#### 3. Update Frontend Hook

Modify `useAdminDashboardData.ts` to pass the user's `org_id` (from profile) to the RPC call.

### Files Changed

| Action | File | Purpose |
|--------|------|---------|
| Migration | SQL migration | Drop & recreate all 27 `admin_all_*` policies with `org_id` filter |
| Migration | SQL migration | Update `get_admin_dashboard_summary` to filter by org |
| Modify | `src/hooks/useAdminDashboardData.ts` | Pass `org_id` to RPC call |

### Impact

After this fix, each agency admin will only see data belonging to their own organization. Platform owners retain full cross-org visibility through their separate `platform_owner_all_*` policies. No UI changes needed — the data filtering happens entirely at the database layer.

