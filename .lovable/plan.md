

## Plan: Add org_id Auto-Set Triggers to All 21 Remaining Tables

### Problem Found

After a full audit, **21 tables** have `org_id` columns with org-scoped RLS policies but **no auto-set trigger**. Any insert without explicit `org_id` will either:
- Fail with "violates row-level security policy" (browser inserts)
- Create invisible records (service-role inserts)

### Tables Already Protected (have triggers)
`transactions`, `audit_logs`, `ad_accounts`, `ad_account_clients`, `agency_accounts`, `agency_expenses`, `billing_notifications`, `campaign_mappings`, `campaign_performance`, `campaign_requests`, `campaigns`, `cash_withdrawals`, `cash_withdrawal_returns`, `client_notices`, `daily_ad_spend`, `daily_metrics`, `fund_transfers`, `liquid_fund_entries`, `notifications`, `payment_requests`, `usd_inventory_snapshots`, `usd_manual_spends`, `usd_purchases`

### Tables Missing Triggers (21 total)

| Table | Lookup Strategy | Insert Sources |
|-------|----------------|----------------|
| `api_integrations` | `auth.uid()` | IntegrationsTab (browser), sync functions |
| `subscription_payments` | `auth.uid()` → already has org_id in payload | SubscriptionGate (browser) |
| `organization_subscriptions` | `auth.uid()` | SubscriptionGate, change-plan edge fn |
| `plan_upgrade_requests` | `auth.uid()` | AgencyDetail (browser) |
| `plan_change_log` | org_id in payload | change-plan edge fn |
| `platform_invoices` | org_id in payload | subscription-lifecycle edge fn |
| `data_export_requests` | `requested_by` → profiles | data-export edge fn |
| `document_acceptances` | `user_id` → profiles | browser |
| `support_tickets` | org_id in payload | AgencySupport (browser) |
| `email_log` | `user_id` → profiles | edge functions |
| `dunning_runs` | `subscription_id` → org_subscriptions | dunning-processor edge fn |
| `gateway_transactions` | `subscription_id` → org_subscriptions | payment-gateway edge fn |
| `overage_charges` | org_id in payload | meter-usage edge fn |
| `sla_metrics` | org_id in payload | sla-monitor edge fn |
| `referral_codes` | org_id in payload | edge fn |
| `payment_gateway_config` | `auth.uid()` | browser |
| `acquisition_costs` | `auth.uid()` | platform admin |
| `feature_usage_events` | org_id in payload | edge fn |
| `tenant_health_scores` | org_id in payload | edge fn |
| `usage_metering_logs` | org_id in payload | edge fn |
| `platform_costs` | platform-level | platform owner |

### Fix — One Migration

Create `BEFORE INSERT` triggers on all 21 tables using the same cascading fallback pattern already proven on the other tables:

```text
1. auth.uid() → get_user_org_id()        (browser)
2. user_id/client_id → profiles.org_id   (edge functions)
3. subscription_id → org_subscriptions   (billing tables)
4. First org fallback                     (single-tenant safety)
```

Group the tables by their lookup strategy to reuse trigger functions:

- **User-based** (10 tables): `api_integrations`, `subscription_payments`, `plan_upgrade_requests`, `document_acceptances`, `support_tickets`, `payment_gateway_config`, `acquisition_costs`, `platform_costs`, `referral_codes`, `email_log` — use `auth.uid()` then `user_id` → profiles
- **Subscription-based** (3 tables): `organization_subscriptions`, `dunning_runs`, `gateway_transactions` — use org_id from subscription
- **Direct org_id** (8 tables): `plan_change_log`, `platform_invoices`, `overage_charges`, `sla_metrics`, `feature_usage_events`, `tenant_health_scores`, `usage_metering_logs`, `data_export_requests` — these already get org_id in payload from edge functions, trigger is safety net only

### Files Changed
| Action | File |
|--------|------|
| Migration | Add 21 `BEFORE INSERT OR UPDATE` trigger functions + triggers |

No UI code changes needed — triggers auto-populate `org_id` transparently. This is the final coverage pass — after this, every table with `org_id` in the system will have automatic resolution.

