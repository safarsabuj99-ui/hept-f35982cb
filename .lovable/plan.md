

## Plan Upgrade System for Agency Admin Side

### What It Does
Agency owners can browse available plans, compare features/limits, and request an upgrade directly from their Plan & Billing page. The platform owner reviews and approves/rejects upgrade requests.

### Database Changes

**New table: `plan_upgrade_requests`**
```sql
CREATE TABLE public.plan_upgrade_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  current_plan text NOT NULL,
  requested_plan text NOT NULL,
  requested_billing_cycle text NOT NULL DEFAULT 'monthly',
  status text NOT NULL DEFAULT 'pending', -- pending | approved | rejected
  admin_note text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.plan_upgrade_requests ENABLE ROW LEVEL SECURITY;

-- Agency admin can insert and read own
CREATE POLICY "org_admin_manage_own_upgrade_requests"
  ON public.plan_upgrade_requests FOR ALL TO authenticated
  USING (org_id = get_user_org_id(auth.uid()))
  WITH CHECK (org_id = get_user_org_id(auth.uid()));

-- Platform owner full access
CREATE POLICY "platform_owner_all_upgrade_requests"
  ON public.plan_upgrade_requests FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'platform_owner'::app_role))
  WITH CHECK (has_role(auth.uid(), 'platform_owner'::app_role));
```

### Frontend Changes

**1. `src/pages/AdminSubscription.tsx` — Add "Upgrade Plan" section**
- New "Upgrade Plan" button next to Current Plan card
- Opens a dialog showing all available plans (fetched from `platform_plans`) in comparison cards
- Each plan card shows: name, monthly/yearly pricing toggle, resource limits (clients, ad accounts, managers), feature flags
- Current plan is highlighted with "Current" badge, higher plans show "Upgrade" button, lower plans are disabled (downgrade not allowed initially)
- On upgrade click: inserts into `plan_upgrade_requests`, notifies platform owner, shows confirmation
- Show pending upgrade request status if one exists (prevents duplicate requests)
- Show upgrade request history below payment submissions

**2. `src/pages/PlatformBilling.tsx` — Add "Upgrade Requests" tab**
- New tab alongside Invoices/Verifications showing pending `plan_upgrade_requests`
- Each request shows: agency name, current plan → requested plan, billing cycle, requested date
- Approve button: updates request status, updates `organizations.plan` + limits + `allowed_features` from `platform_plans`, updates `organization_subscriptions` with new plan/amount, creates new invoice, notifies agency admin
- Reject button: updates status with admin note, notifies agency admin

**3. `src/pages/AgencyDetail.tsx` — Show upgrade request history**
- In subscription section, show recent `plan_upgrade_requests` for that agency

### Smart Safeguards
- Prevent duplicate pending requests (check before insert)
- Only allow upgrading to higher-tier plans (sort_order comparison)
- Auto-sync resource limits and feature flags on approval from `platform_plans` table
- Auto-generate a new invoice for the price difference or full new period

### Files Changed
- 1 database migration (new table + RLS)
- `src/pages/AdminSubscription.tsx` — upgrade plan dialog + request history
- `src/pages/PlatformBilling.tsx` — upgrade requests tab
- `src/pages/AgencyDetail.tsx` — upgrade request history in subscription section

