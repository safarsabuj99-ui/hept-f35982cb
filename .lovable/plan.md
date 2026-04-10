

## Fix Agency Detail: Accurate Usage Stats & Full Subscription Management

### Problem 1: Usage Stats Are Wrong
The current code counts clients and managers using **broken heuristics** — it filters `profiles` by checking if `permissions` has keys (for managers) and excludes the owner (for clients). This never matches actual roles because roles live in `user_roles`, not `profiles.permissions`.

**Fix:** Query `user_roles` joined with `profiles` to get accurate counts by role:
- Clients = profiles in this org with `user_roles.role = 'client'`
- Managers = profiles in this org with `user_roles.role = 'manager'`
- Ad Accounts = already correct (counts `ad_accounts` by `org_id`)

### Problem 2: Subscription Not Editable
Currently you can only change the plan dropdown. No way to edit billing cycle, payment status, period dates, amount, or payment method.

**Fix:** Add a full subscription editor in the Overview tab:
- Editable fields: billing cycle (monthly/yearly), payment status (pending/paid/overdue), current period start/end, amount, payment method, transaction reference
- When switching billing cycle, auto-recalculate amount from `platform_plans` (monthly vs yearly price)
- Per-feature override toggles — allow customizing `allowed_features` per agency beyond the plan defaults

### Implementation

**File: `src/pages/AgencyDetail.tsx`**

1. **Fix usage counting (lines 53-77):**
   - Add a query: `supabase.from("user_roles").select("user_id, role").in("user_id", profileUserIds)`
   - Count clients = user_roles where role='client' AND user_id is in org profiles
   - Count managers = user_roles where role='manager' AND user_id is in org profiles

2. **Add subscription editor section:**
   - Replace the read-only subscription card with an editable form
   - Add fields for: billing_cycle (Select), payment_status (Select), current_period_start/end (Input date), amount_bdt (Input number), payment_method (Input text), transaction_reference (Input text)
   - Save button updates `organization_subscriptions` record
   - When billing cycle changes between monthly/yearly, auto-update amount from the plan's `price_bdt_monthly` or `price_bdt_yearly`

3. **Add per-agency feature override:**
   - Below the Plan Features card, add an "Override Features" button
   - Opens a dialog with toggle switches for each feature flag
   - Saves directly to `organizations.allowed_features` without changing the plan
   - Shows a badge "Custom" when features differ from the plan defaults

4. **Fetch `price_bdt_yearly` in plan query** — currently only fetches `price_bdt_monthly`

### Files Changed
- `src/pages/AgencyDetail.tsx` — fix usage counting, add subscription editor, add feature override

