

## Plan: Operational Subscription Lifecycle — Trial Expiry, Payment Gates, Auto-Upgrade

### Current State
- `ProtectedRoute` only blocks `pending_payment` status (shows "Payment Under Review")
- `subscription-lifecycle` edge function auto-suspends overdue agencies but the frontend doesn't show blocking screens for `trial` expired, `suspended`, or `overdue` states
- Agency can pay manually via `AdminSubscription.tsx` but there's no forced upgrade/payment flow when trial ends
- No auto-payment gateway integration exists
- The `org_status` enum has: `active`, `trial`, `suspended`, `cancelled`, `pending_payment`

### What We'll Build

A complete operational lifecycle where every org status maps to a specific user experience:

```text
Trial (active access)
  │
  ├─ Trial expires → status = "suspended" (reason: "Trial expired")
  │   │
  │   └─ Admin logs in → BLOCKED → "Trial Ended" screen
  │       ├─ "Upgrade Now" button → Payment flow
  │       │   ├─ Manual Payment → Submit proof → status = "pending_payment"
  │       │   │   └─ Platform approves → status = "active" ✅
  │       │   └─ Auto Payment (gateway) → Success → status = "active" ✅
  │       └─ Sign Out
  │
  ├─ Subscription overdue → status = "suspended" (reason: "Payment overdue")
  │   └─ Same blocked screen with "Renew Now" 
  │
  └─ Cancelled → "Account Cancelled" screen (contact support)
```

### Changes

#### 1. ProtectedRoute.tsx — Add Blocking Screens for All Statuses
Currently only handles `pending_payment`. Add:
- **`suspended` + trial expired** → "Trial Ended — Upgrade to Continue" screen with plan selection and payment
- **`suspended` + payment overdue** → "Subscription Overdue — Renew Now" screen  
- **`cancelled`** → "Account Cancelled" screen with support contact
- Each screen has contextual messaging, upgrade/pay buttons, and sign-out option

#### 2. New Component: `SubscriptionGate.tsx`
A full-page component shown inside ProtectedRoute when org is blocked. Contains:
- Status-aware messaging (trial ended vs overdue vs cancelled)
- Plan selection cards (fetched from `platform_plans`)
- Payment method choice: **Manual** (bKash/Nagad/Bank proof upload) OR **Auto** (payment gateway)
- Manual flow: upload proof → creates `subscription_payments` record → org goes to `pending_payment` → platform owner approves
- Auto flow: calls `payment-gateway` edge function → on success → auto-activates org

#### 3. Edge Function: `payment-gateway/index.ts` (Update)
Add logic to handle subscription payments:
- Accept `org_id`, `plan_key`, `billing_cycle`, `amount_bdt`
- On successful payment: update org status to `active`, create/update subscription, generate paid invoice, sync plan limits
- This enables the "auto-activate on payment success" flow

#### 4. `tenant-lifecycle-check` Edge Function (Update)
Currently only suspends expired trials. Add:
- Set `suspension_reason = 'Trial expired'` (already does this)
- Send notification to agency owner with upgrade link

#### 5. `subscription-lifecycle` Edge Function (Already Handles Overdue)
No changes needed — it already marks overdue and suspends after grace period.

### User Journey Examples

**Example 1: Trial Ends**
1. Agency signs up → 14-day trial → `status = trial`
2. Day 15: `tenant-lifecycle-check` runs → `status = suspended`, `suspension_reason = "Trial expired"`
3. Agency admin logs in → ProtectedRoute detects `suspended` → Shows "Trial Ended" gate
4. Admin selects Growth plan → Chooses bKash → Uploads proof → `status = pending_payment`
5. Platform owner approves in Billing tab → `status = active`, subscription created

**Example 2: Auto-Payment**
1. Same as above, but admin clicks "Pay with Gateway"
2. Payment gateway processes → Success callback → `status = active` automatically
3. No manual approval needed

**Example 3: Subscription Overdue**
1. Active agency's period ends → Payment not received
2. `subscription-lifecycle` marks overdue → After grace period → `status = suspended`
3. Admin logs in → Sees "Subscription Overdue" gate → Pays → Reactivated

### Files Changed/Created

| Action | File | Purpose |
|--------|------|---------|
| Create | `src/components/SubscriptionGate.tsx` | Full-page blocked screen with plan selection + payment |
| Modify | `src/components/ProtectedRoute.tsx` | Check `suspended`/`cancelled` status, render SubscriptionGate |
| Modify | `supabase/functions/payment-gateway/index.ts` | Add subscription payment + auto-activation logic |
| Modify | `supabase/functions/tenant-lifecycle-check/index.ts` | Add notification to owner on trial expiry |

### Technical Details

**ProtectedRoute logic update:**
```text
if orgStatus === "pending_payment" → existing "Payment Under Review" screen
if orgStatus === "suspended" → <SubscriptionGate reason={suspension_reason} />
if orgStatus === "cancelled" → <SubscriptionGate cancelled />
```

**SubscriptionGate payment flow:**
- Manual: Insert into `subscription_payments` → Update org to `pending_payment` → Wait for approval
- Auto (gateway): POST to `payment-gateway` → On 200 → Org auto-activated → Refresh page

No new database tables needed. Uses existing `subscription_payments`, `organization_subscriptions`, `platform_invoices`, and `platform_plans` tables.

