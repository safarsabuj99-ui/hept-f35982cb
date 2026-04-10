

## Add Plan Information & Renewal to Agency Admin Side

### What's Missing
Agency admins currently have zero visibility into their subscription plan. They can't see what plan they're on, what features are included, usage limits, billing cycle, or when renewal is due. All subscription management is only on the platform owner side.

### Implementation

**1. New Page: `src/pages/AdminSubscription.tsx`**
A dedicated "Plan & Billing" page for agency admins showing:
- **Current Plan Card** — plan name, status (Trial/Active/Suspended), trial end date if applicable
- **Usage Gauges** — clients used vs max_clients, ad accounts used vs max_ad_accounts, managers used vs max_managers (with progress bars)
- **Included Features** — list of feature flags from `organizations.allowed_features` with enabled/disabled indicators
- **Billing Info** — current period start/end, billing cycle, amount, payment status from `organization_subscriptions`
- **Invoice History** — list of `platform_invoices` for the org (read-only)
- **Renewal Action** — if payment_status is "pending" or "overdue", show a prominent "Request Renewal" button that creates a notification to the platform owner requesting renewal/payment processing

**2. Update `src/components/AdminLayout.tsx`**
Add a new nav item under the "System" section:
```
{ to: "/admin/subscription", icon: CreditCard, label: "Plan & Billing", permKey: "can_configure_system" }
```

**3. Update `src/App.tsx`**
Add route: `/admin/subscription` → `AdminSubscription`

**4. Data Queries (all read-only, existing RLS supports this)**
- `organizations` — `org_admin_read_own_org` policy already grants SELECT
- `organization_subscriptions` — `org_admin_read_own_subscriptions` policy already grants SELECT
- `platform_invoices` — `org_admin_read_own_invoices` policy already grants SELECT
- `profiles` count by org_id — `admin_all_profiles` already grants access
- `ad_accounts` count by org_id — `admin_all_ad_accounts` already grants access

No database migration needed — all required RLS policies already exist.

### Files Changed
- `src/pages/AdminSubscription.tsx` — new page
- `src/components/AdminLayout.tsx` — add nav item
- `src/App.tsx` — add route

