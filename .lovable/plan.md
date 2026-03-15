

## Plan: Platform Admin Panel for SaaS Agency Management

### The Big Picture

Right now, your system is **single-tenant** — one agency (you) uses the platform. To sell this as a SaaS, you need a **multi-tenant architecture** with a new top-level role: **Platform Owner** (you), who creates and manages agency accounts. Each agency then has its own admin, managers, and clients — completely isolated.

```text
┌─────────────────────────────────────────────┐
│          PLATFORM OWNER (You)               │
│  /platform/agencies  /platform/billing      │
├─────────────────────────────────────────────┤
│  Agency A          │  Agency B              │
│  ├─ Admin          │  ├─ Admin              │
│  ├─ Managers       │  ├─ Managers           │
│  └─ Clients        │  └─ Clients            │
│  (isolated data)   │  (isolated data)       │
└─────────────────────────────────────────────┘
```

### Phase 1: Database Schema (Multi-Tenancy Foundation)

**New tables:**

| Table | Purpose |
|-------|---------|
| `organizations` | Each agency is an org — name, logo, plan, status, limits, created_at |
| `organization_subscriptions` | Plan tier, billing cycle, start/end dates, payment status |

**Schema for `organizations`:**
- `id`, `name`, `slug` (unique subdomain-friendly), `logo_url`
- `plan` enum: `starter`, `growth`, `agency_pro`
- `status` enum: `active`, `suspended`, `trial`, `cancelled`
- `max_clients`, `max_ad_accounts`, `max_managers` (plan limits)
- `trial_ends_at`, `created_at`, `owner_user_id`

**Schema for `organization_subscriptions`:**
- `id`, `org_id`, `plan`, `amount_bdt`, `billing_cycle` (monthly/yearly)
- `current_period_start`, `current_period_end`, `payment_status`
- `payment_method`, `transaction_reference`

**Modify existing tables:**
- Add `org_id UUID` column to: `profiles`, `ad_accounts`, `ad_account_clients`, `campaigns`, `daily_metrics`, `transactions`, `api_integrations`, `settings`, `agency_accounts`, `usd_purchases`, `agency_expenses`, etc.
- Update ALL RLS policies to include `org_id` filtering — every query is scoped to the user's organization

**New role:**
- Add `platform_owner` to `app_role` enum
- Platform owner bypasses org scoping and sees everything

### Phase 2: Platform Admin Panel (Frontend)

**New routes under `/platform/*`:**

| Route | Page |
|-------|------|
| `/platform` | Dashboard — total agencies, MRR, active users, growth chart |
| `/platform/agencies` | Agency list — name, plan, status, client count, revenue |
| `/platform/agencies/new` | Create new agency + first admin account |
| `/platform/agencies/:id` | Agency detail — usage stats, plan management, suspend/activate |
| `/platform/billing` | Subscription overview — payments received, overdue, upcoming renewals |
| `/platform/plans` | Manage plan tiers and pricing |

**Platform Dashboard KPIs:**
- Total Agencies (active/trial/suspended)
- Monthly Recurring Revenue (MRR) in BDT
- Total End-Clients across all agencies
- Total Ad Spend managed through platform
- New signups this month

**Agency Detail Page features:**
- View all usage metrics (clients, ad accounts, managers vs plan limits)
- Change plan tier
- Suspend / Reactivate agency
- Reset agency admin password
- View agency's login activity
- Manual billing entry (mark payment received)

### Phase 3: Agency Onboarding Flow

**Edge Function: `create-organization`**
1. Platform owner calls it with agency details + admin email/password
2. Creates `organizations` row with plan limits
3. Creates auth user for the agency admin
4. Creates profile with `org_id` set
5. Assigns `admin` role to the agency admin
6. Creates default settings for that org
7. Returns org ID + admin credentials

### Phase 4: Tenant Isolation (RLS Overhaul)

**New helper function:**
```sql
CREATE FUNCTION get_user_org_id(_user_id UUID) RETURNS UUID
-- Returns the org_id from profiles for the given user
```

**RLS pattern for every table:**
```sql
-- Example: ad_accounts
CREATE POLICY "org_isolation" ON ad_accounts
FOR ALL USING (
  org_id = get_user_org_id(auth.uid())
  OR has_role(auth.uid(), 'platform_owner')
);
```

Every existing RLS policy gets an additional `org_id` check so agencies can never see each other's data.

### Phase 5: Plan Enforcement

**Edge function middleware** checks limits before actions:
- Creating a client → check `current_clients < max_clients`
- Adding ad account → check `current_accounts < max_ad_accounts`
- Creating manager → check `current_managers < max_managers`

Limits are stored in `organizations` and enforced in both the `create-client` edge function and frontend UI (show upgrade prompts when near limits).

### Files to Create/Change

| File | Change |
|------|--------|
| Database | New `organizations`, `organization_subscriptions` tables; add `org_id` to all existing tables; new RLS policies; new `platform_owner` role |
| `supabase/functions/create-organization/index.ts` | New edge function for agency creation |
| `supabase/functions/create-client/index.ts` | Add plan limit checks + `org_id` propagation |
| `src/hooks/useAuth.tsx` | Handle `platform_owner` role, redirect to `/platform` |
| `src/App.tsx` | Add `/platform/*` routes with `PlatformLayout` |
| `src/components/PlatformLayout.tsx` | New layout for platform admin |
| `src/pages/PlatformDashboard.tsx` | MRR, agency count, growth KPIs |
| `src/pages/AgencyList.tsx` | List all agencies with status, plan, usage |
| `src/pages/AgencyDetail.tsx` | Single agency management page |
| `src/pages/CreateAgency.tsx` | Form to create agency + first admin |
| `src/pages/PlatformBilling.tsx` | Subscription/payment tracking |
| `src/pages/PlatformPlans.tsx` | Manage pricing tiers |

### Implementation Order

1. **Database first** — `organizations` table, `org_id` columns, `platform_owner` role, helper functions
2. **Create-organization edge function** — agency creation flow
3. **Platform layout + routes** — navigation structure
4. **Platform dashboard + agency list** — core management UI
5. **Agency detail + billing pages** — per-agency controls
6. **RLS overhaul** — tenant isolation across all tables
7. **Plan enforcement** — limit checks in edge functions

### What This Enables

- You log in as Platform Owner and see all agencies
- Each agency admin logs in and sees only their own data (same UI they have now)
- You control plans, suspend agencies, track revenue
- Agencies are completely isolated from each other
- You can scale to hundreds of agencies with the same codebase

