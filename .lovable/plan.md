

## SaaS Management System — Full Audit & Implementation Plan

### Audit Summary: What Exists vs What's Missing

**What's Already Built (Working):**
- Platform Owner dashboard with KPIs (MRR, ARR, ARPA, agency counts)
- Agency CRUD (create, detail, list) with admin user provisioning
- Plan management (Starter/Growth/Agency Pro with resource limits)
- Tenant lifecycle Kanban (Trial → Active → Suspended → Cancelled)
- Invoice management with aging buckets, payment recording, auto-generation
- Revenue analytics (MRR snapshots, billed vs collected charts)
- Usage metering (clients, ad accounts, managers vs limits)
- Intelligence suite (cohorts, churn, adoption, forecasting, costs, health scores, benchmarks)
- Announcements, audit logs, system health

**Critical Gaps Identified (Must Fix):**

| # | Gap | Impact |
|---|-----|--------|
| 1 | No automated subscription renewal or expiry handling | Agencies keep running after subscription expires |
| 2 | No cron job for `tenant-lifecycle-check` | Expired trials never auto-suspend |
| 3 | No automated invoice overdue detection | Invoices stay "sent" forever, no follow-up |
| 4 | `CreateAgency` doesn't create a subscription record | New agencies have no billing cycle tracked |
| 5 | Plan changes don't update resource limits on org | Changing plan on AgencyDetail doesn't sync max_clients/max_ad_accounts/max_managers |
| 6 | No enforcement of resource limits | Agencies can exceed their plan quotas freely |
| 7 | Upcoming renewal widget shows org_id, not agency name | Unusable in production |
| 8 | No subscription status indicator on agency list/detail | Can't see who's paid vs expired |
| 9 | No automated notifications for subscription events | No renewal reminders, expiry warnings, or overdue alerts |
| 10 | Dashboard queries not gated on session | Already fixed per earlier work, but platform pages still lack it |

---

### Implementation Plan

#### 1. Auto-Create Subscription on Agency Creation
**File:** `src/pages/CreateAgency.tsx`

After creating the org, automatically insert into `organization_subscriptions` with the selected plan's pricing, `payment_status: 'pending'`, and correct billing period dates. Also fetch plan limits from `platform_plans` to set correct `max_clients/max_ad_accounts/max_managers` on the org.

#### 2. Cron Job: Tenant Lifecycle Check (Auto-Suspend Expired Trials)
**Database migration** — Add a cron job calling `tenant-lifecycle-check` every 6 hours. The edge function already exists and works correctly.

#### 3. Cron Job: Subscription Renewal & Overdue Detection
**New edge function:** `subscription-lifecycle`
- Mark invoices as `overdue` when past `due_date` and still `sent`
- Check subscriptions where `current_period_end < today` — if no paid invoice exists for the next period, set `payment_status: 'overdue'` and optionally suspend the agency after a grace period
- Send renewal reminder notifications 7 days and 3 days before `current_period_end`
- Auto-generate next-period invoice 10 days before renewal

**Database migration** — Add cron job running daily at midnight.

#### 4. Plan Change Syncs Resource Limits
**File:** `src/pages/AgencyDetail.tsx`

When admin changes the plan dropdown, also update `max_clients`, `max_ad_accounts`, `max_managers` on the org by looking up the `platform_plans` table. Update the subscription record's `amount_bdt` and `plan` too.

#### 5. Resource Limit Enforcement
**Database migration** — Create validation triggers on `profiles`, `ad_accounts` that check current count vs org limits before INSERT. Return a clear error message when exceeded.

#### 6. Fix Dashboard Renewals Widget
**File:** `src/pages/PlatformDashboard.tsx`

Join `organization_subscriptions` with `organizations` to show agency name instead of truncated UUID. Also add subscription health status (paid/pending/overdue) badges.

#### 7. Subscription Status on Agency Views
**Files:** `src/pages/AgencyList.tsx`, `src/pages/AgencyDetail.tsx`

Fetch subscription data alongside org data. Show payment status badges (Paid, Pending, Overdue) and next renewal date on agency cards and detail page.

#### 8. Automated Notifications for Subscription Events
**In the `subscription-lifecycle` edge function:**
- Renewal reminder → `notifications` table with `type: 'system'`, `priority: 'high'`
- Overdue alert → `notifications` with `priority: 'urgent'`
- Auto-suspension warning → notification 3 days before suspension

#### 9. Gate Platform Page Queries on Auth Session
**Files:** All `src/pages/Platform*.tsx` files

Add `enabled: !!session` to queries in platform pages that currently lack gating, preventing empty-cache race conditions.

---

### Technical Details

**New Edge Function:** `supabase/functions/subscription-lifecycle/index.ts`
```text
1. Fetch all org_subscriptions where current_period_end <= today + 10 days
2. For each:
   - If period_end in 7 or 3 days → send renewal reminder notification
   - If period_end in 10 days and no next invoice → auto-generate invoice
   - If period_end < today and payment_status != 'paid' → mark overdue
   - If overdue > grace_period_days → suspend org
3. Fetch platform_invoices where status='sent' and due_date < today → mark 'overdue'
```

**New Cron Jobs (migration):**
```sql
-- Tenant lifecycle check (expired trials)
SELECT cron.schedule('tenant-lifecycle-6h', '0 */6 * * *', $$...$$);

-- Subscription lifecycle (renewals, overdue, invoicing)
SELECT cron.schedule('subscription-lifecycle-daily', '0 0 * * *', $$...$$);
```

**Resource Limit Trigger (migration):**
```sql
CREATE FUNCTION check_org_resource_limit() RETURNS trigger ...
-- Before INSERT on profiles (for clients), check COUNT vs org.max_clients
-- Before INSERT on ad_accounts, check COUNT vs org.max_ad_accounts
```

### Files Modified/Created
- `src/pages/CreateAgency.tsx` — auto-create subscription + fetch plan limits
- `src/pages/AgencyDetail.tsx` — plan change syncs limits + subscription display
- `src/pages/AgencyList.tsx` — subscription status badges
- `src/pages/PlatformDashboard.tsx` — fix renewals widget, show agency names
- `supabase/functions/subscription-lifecycle/index.ts` — new edge function
- Database migration — cron jobs, resource limit triggers
- Platform page query gating (PlatformChurnPrediction, PlatformFeatureAdoption, etc.)

