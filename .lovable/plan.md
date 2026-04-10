

## Full Operational SaaS Plan — Feature-Based Plan Enforcement

### Problem
Currently, plan "features" (like "Basic Analytics", "API Access", "White Label") are just display text. Agencies get **no real enforcement** — every agency can use every feature regardless of plan. Also, the subscription for "MD SABUJ MIAH Agency" shows plan `starter` while the org shows `agency_pro` — a data mismatch.

### What Changes

#### 1. Structured Feature Flags on Plans (Database)
Add a `feature_flags` JSONB column to `platform_plans` with boolean toggles for every real feature the platform offers. Replace the current free-text `features` with structured, enforceable flags.

Feature flags to support:
- `ad_guard` — Auto-pause on low balance
- `advanced_analytics` — Deep-dive campaign analytics
- `api_access` — API integrations (Meta/TikTok/Google)
- `white_label` — Custom branding (logo, colors)
- `campaign_requests` — Client self-service campaign submissions
- `multi_manager` — More than 1 manager
- `priority_support` — Priority support badge
- `expense_tracking` — Agency expense manager
- `cash_flow` — Cash flow & withdrawal management
- `usd_inventory` — USD inventory tracking
- `custom_exchange_rate` — Per-client exchange rates
- `client_notices` — Dashboard notice banners

#### 2. Sync Feature Flags to Organizations (Database)
Add `allowed_features` JSONB column to `organizations`. When a plan is assigned or changed, the org's `allowed_features` is synced from the plan's `feature_flags`.

#### 3. Fix Data Mismatch
Update MD SABUJ MIAH Agency's subscription record to match the org plan (`agency_pro`).

#### 4. Enhanced Plan Management UI
Replace the free-text features textarea in `PlatformPlans.tsx` with a structured toggle grid. Each feature gets a switch with a clear label. The free-text list is auto-generated from enabled flags for display on plan cards.

#### 5. Plan Change Syncs Features
Update `AgencyDetail.tsx` and `CreateAgency.tsx` to also sync `allowed_features` from the plan's `feature_flags` when assigning/changing plans.

#### 6. Feature Gate Hook
Create `src/hooks/useOrgFeatures.ts` — reads the org's `allowed_features` and exposes a `hasFeature(key)` helper. Agency admin UI components can use this to show/hide features based on the plan.

#### 7. Gate Key Features in Agency Admin UI
Add feature gates to:
- `AdminLayout.tsx` sidebar — hide nav items for features not in plan
- `BrandingTab.tsx` — gate behind `white_label`
- `ExpenseManager.tsx` — gate behind `expense_tracking`
- `CashFlowManagement.tsx` — gate behind `cash_flow`
- `WalletInventory.tsx` — gate behind `usd_inventory`
- `AutomationConfigTab.tsx` — gate behind `ad_guard`
- Campaign request pages — gate behind `campaign_requests`

When a feature is gated, show an upgrade prompt instead of hiding completely (better UX and upsell opportunity).

### Files Modified/Created

- **Database migration**: Add `feature_flags` to `platform_plans`, `allowed_features` to `organizations`
- **Data fix**: Sync subscription plan for MD SABUJ MIAH Agency
- `src/pages/PlatformPlans.tsx` — structured feature toggle grid
- `src/pages/CreateAgency.tsx` — sync `allowed_features` on creation
- `src/pages/AgencyDetail.tsx` — sync `allowed_features` on plan change; show enabled features
- `src/hooks/useOrgFeatures.ts` — new hook for feature gating
- `src/components/AdminLayout.tsx` — gate sidebar nav items
- Key feature pages — add upgrade prompts for gated features

### Technical Details

```text
platform_plans.feature_flags (JSONB):
{
  "ad_guard": true,
  "advanced_analytics": false,
  "api_access": false,
  "white_label": false,
  "campaign_requests": true,
  "multi_manager": false,
  "expense_tracking": false,
  "cash_flow": false,
  "usd_inventory": false,
  "custom_exchange_rate": false,
  "client_notices": true,
  "priority_support": false
}

organizations.allowed_features (JSONB):
-- Copied from plan's feature_flags on plan assignment
-- Platform owner can override per-agency
```

Default feature_flags per existing plan:
- **Starter**: ad_guard, campaign_requests, client_notices
- **Growth**: + advanced_analytics, multi_manager, api_access, expense_tracking, custom_exchange_rate
- **Agency Pro**: All features enabled

