

## Plan: Full SaaS Management System

### What Exists Now
Basic scaffolding: 4 KPI cards, agency list/create/detail, static billing table, static plans page. No real-time usage tracking, no revenue analytics, no automated billing, no agency impersonation, no notifications, no audit trail, no self-service portal.

### What a Production SaaS Management System Needs

```text
┌─────────────────────────────────────────────────────────────┐
│                    PLATFORM OWNER PORTAL                     │
├──────────┬──────────┬──────────┬──────────┬─────────────────┤
│Dashboard │Agencies  │Revenue   │Plans     │System           │
│• MRR/ARR │• List    │• Invoice │• CRUD    │• Audit Logs     │
│• Churn   │• Detail  │  History │  Tiers   │• Announcements  │
│• Growth  │• Usage   │• Payment │• Feature │• Login-As       │
│• Alerts  │• Login-As│  Record  │  Flags   │• Health Monitor │
└──────────┴──────────┴──────────┴──────────┴─────────────────┘
```

---

### Phase 1: Enhanced Dashboard (`PlatformDashboard.tsx`)

**Current:** 4 static KPI cards.
**Upgrade to:**

| KPI | Source |
|-----|--------|
| MRR / ARR | Sum of active subscriptions (monthly × 1, yearly ÷ 12) |
| Total Revenue Collected | Sum of all `paid` subscription payments |
| Active / Trial / Suspended counts | `organizations.status` |
| Churn Rate | Agencies that moved to `cancelled` this month vs last month's active |
| Average Revenue Per Agency (ARPA) | MRR ÷ active agencies |
| Total End-Clients | Count of `profiles` with `client` role across all orgs |
| Total Ad Spend Managed | Sum of `daily_metrics.spend` across all orgs |

**Add charts:**
- MRR Growth (line chart, last 12 months) — requires new `platform_revenue_snapshots` table
- Agency Signup Trend (bar chart, last 6 months)
- Plan Distribution (donut chart)
- Upcoming Renewals list (next 30 days)
- Overdue Payments alert panel

---

### Phase 2: Agency Detail Overhaul (`AgencyDetail.tsx`)

**Current:** Plan/status dropdowns + static limit numbers.
**Upgrade with tabs:**

| Tab | Content |
|-----|---------|
| Overview | Real-time usage vs limits (clients/accounts/managers used vs max), trial countdown, admin contact info |
| Billing History | All subscription payments for this agency, mark as paid, add manual payment |
| Activity Log | Audit logs filtered by `org_id` — logins, client creation, spend events |
| Settings | Edit limits individually, override plan defaults, custom pricing |

**New features on detail page:**
- **Login-As Agency Admin** — Platform owner clicks a button, gets redirected to `/admin` as if they were that agency's admin (uses impersonation pattern already in codebase)
- **Suspend with Reason** — When suspending, prompt for reason, store in `organizations.suspension_reason`
- **Usage Meters** — Visual progress bars: "12 / 20 Clients Used", "45 / 50 Ad Accounts"
- **Reset Admin Password** — Button that calls `reset-client-password` edge function for the org's owner

---

### Phase 3: Plan & Pricing Management (`PlatformPlans.tsx`)

**Current:** Static hardcoded plan cards.
**Upgrade to dynamic CRUD:**

**New table: `platform_plans`**
| Column | Type |
|--------|------|
| `id` | uuid |
| `name` | text (e.g. "Starter") |
| `key` | text (unique, e.g. "starter") |
| `price_bdt_monthly` | numeric |
| `price_bdt_yearly` | numeric |
| `max_clients` | integer |
| `max_ad_accounts` | integer |
| `max_managers` | integer |
| `features` | jsonb (array of feature strings) |
| `is_popular` | boolean |
| `is_active` | boolean |
| `sort_order` | integer |
| `created_at` | timestamptz |

This replaces the hardcoded `org_plan` enum approach — plans become data-driven so you can create new tiers, adjust pricing, and toggle visibility without code changes.

**UI:** Editable table/cards with inline editing for price, limits, features. Toggle active/inactive. Drag to reorder.

---

### Phase 4: Revenue & Invoicing (`PlatformBilling.tsx` → full billing hub)

**Current:** Simple subscription list.
**Upgrade to:**

**New table: `platform_invoices`**
| Column | Type |
|--------|------|
| `id` | uuid |
| `org_id` | uuid |
| `invoice_number` | text (auto-generated, e.g. "INV-2026-001") |
| `amount_bdt` | numeric |
| `period_start` | date |
| `period_end` | date |
| `status` | enum: `draft`, `sent`, `paid`, `overdue`, `void` |
| `payment_date` | date |
| `payment_method` | text |
| `notes` | text |
| `created_at` | timestamptz |

**Billing page sections:**
1. **Revenue Summary** — Total collected this month, outstanding, overdue count
2. **Invoice List** — Filterable by status, agency, date range
3. **Record Payment** — Mark invoice as paid with payment method + reference
4. **Auto-Generate Invoices** — Button/cron that creates next-period invoices for all active subscriptions
5. **Export** — Download invoice data as CSV

---

### Phase 5: Platform Announcements & Notifications

**New table: `platform_announcements`**
| Column | Type |
|--------|------|
| `id` | uuid |
| `title` | text |
| `body` | text |
| `type` | enum: `info`, `warning`, `maintenance` |
| `target_plan` | text (nullable — null means all) |
| `is_active` | boolean |
| `starts_at` | timestamptz |
| `ends_at` | timestamptz |
| `created_at` | timestamptz |

Agency admins see active announcements as banners in their dashboard. Platform owner creates/manages them from `/platform/announcements`.

---

### Phase 6: Platform Audit & System Health

**New page: `/platform/audit`**
- View all audit logs across all organizations
- Filter by org, action type, date range
- Track platform-level events: agency created, plan changed, suspension, password resets

**New page: `/platform/health`**
- Edge function execution status
- Database connection health
- API integration status across all agencies
- Failed sync count per agency

---

### Phase 7: Login-As (Agency Impersonation)

Leverages the existing `useImpersonation` hook pattern:
- Platform owner clicks "Login As" on agency detail
- Sets `sessionStorage.impersonate_org_id` + navigates to `/admin`
- `useAuth` detects impersonation and scopes all queries to that org
- Yellow banner: "Viewing as [Agency Name] — Exit" at top of admin layout

---

### Database Changes Summary

| Table | Action |
|-------|--------|
| `platform_plans` | **CREATE** — dynamic plan definitions |
| `platform_invoices` | **CREATE** — invoice/payment tracking |
| `platform_announcements` | **CREATE** — broadcast messages to agencies |
| `organizations` | **ALTER** — add `suspension_reason text`, `notes text` |
| `organization_subscriptions` | Already exists, link to invoices |

RLS: All new tables get `platform_owner` full access policy only.

### New Pages & Routes

| Route | Page | Purpose |
|-------|------|---------|
| `/platform` | Enhanced Dashboard | MRR, charts, alerts |
| `/platform/agencies` | Enhanced List | Usage columns, search, filters |
| `/platform/agencies/:id` | Tabbed Detail | Usage meters, billing history, login-as, activity |
| `/platform/billing` | Invoice Hub | Revenue summary, invoice CRUD, payment recording |
| `/platform/plans` | Plan Manager | CRUD plan tiers with pricing & feature flags |
| `/platform/announcements` | Announcements | Create/manage broadcast messages |
| `/platform/audit` | Audit Logs | Cross-org activity viewer |
| `/platform/health` | System Health | Edge function & sync monitoring |

### Implementation Order

1. Database: `platform_plans`, `platform_invoices`, `platform_announcements` tables + RLS
2. Enhanced Dashboard with charts (MRR trend, plan distribution)
3. Dynamic Plans CRUD page
4. Invoice/billing hub with payment recording
5. Agency Detail overhaul (tabs, usage meters, login-as)
6. Announcements management
7. Audit logs & system health pages
8. Agency impersonation flow

