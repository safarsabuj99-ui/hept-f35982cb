

## Plan: Payment-First Upgrade Flow (No Separate Upgrade Approval)

### Problem
Currently, agencies submit an "upgrade request" (no payment), and the platform owner must approve/reject it separately. The user wants: **agency must pay first, then upgrade happens automatically when payment is approved.** No separate upgrade approve/reject flow.

### New Flow

```text
Agency wants to upgrade
  → Selects plan → Opens payment dialog (with plan info embedded)
  → Submits manual payment proof (with requested_plan + billing_cycle stored on the payment record)
  → Platform owner sees payment in Verifications tab (with upgrade info shown)
  → Approves payment → System auto-upgrades org plan, limits, features, subscription
  → Rejects payment → Agency notified, no upgrade
```

### Changes

#### 1. Database Migration — Add upgrade fields to `subscription_payments`
Add columns to store the upgrade intent on the payment itself:
- `requested_plan text` (nullable, only set for upgrade payments)
- `requested_billing_cycle text` (nullable)

This eliminates the need for the separate `plan_upgrade_requests` table for new flows.

#### 2. `src/pages/AdminSubscription.tsx` — Merge Upgrade into Payment
- **Remove** `handleUpgradeRequest` (which just creates a `plan_upgrade_requests` row)
- Change "Request Upgrade" button to open the existing **Pay Now dialog**, pre-filled with the upgrade plan's price
- Store `requested_plan` and `requested_billing_cycle` in the `subscription_payments` insert
- Remove the "Upgrade Request History" section and "Pending Upgrade" banner (replace with payment-based tracking)

#### 3. `src/pages/PlatformBilling.tsx` — Auto-Upgrade on Payment Approval
- **Remove** the "Upgrades" tab entirely
- **Enhance** `approvePayment()`: if the payment has `requested_plan` set, automatically:
  - Fetch target plan from `platform_plans`
  - Update `organizations` (plan, limits, features)
  - Update `organization_subscriptions` (plan, cycle, amount)
  - Set org status to `active` if it was `trial` or `suspended`
  - Generate an invoice
- Show upgrade info (from → to plan) in the Verifications table for upgrade payments
- Remove all `plan_upgrade_requests` / `reviewingUpgrade` / `approveUpgrade` / `rejectUpgrade` code

#### 4. Clean up
- Remove `upgradeRequests` state, `reviewingUpgrade`, `upgradeRejectNote`, reject upgrade dialog from PlatformBilling
- Remove `pendingUpgrade`, `upgradeRequests` state from AdminSubscription
- Remove references to `plan_upgrade_requests` table queries

### Files Changed

| File | Change |
|------|--------|
| Migration | Add `requested_plan`, `requested_billing_cycle` to `subscription_payments` |
| `src/pages/AdminSubscription.tsx` | Replace "Request Upgrade" with "Pay & Upgrade" flow |
| `src/pages/PlatformBilling.tsx` | Remove Upgrades tab, add auto-upgrade logic to `approvePayment` |

