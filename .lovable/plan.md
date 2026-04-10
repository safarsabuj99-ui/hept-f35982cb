

## Subscription Payment Gateway — Manual + Automatic

### Overview
Add a complete payment system so agency owners can pay for their subscriptions directly from their Plan & Billing page. Two methods: manual payment with proof upload (verified by platform owner) and automatic gateway (Stripe).

### Database Changes

**New table: `subscription_payments`**
Tracks all payment submissions for subscriptions.

```sql
CREATE TABLE public.subscription_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  invoice_id uuid,
  amount_bdt numeric NOT NULL,
  payment_method text NOT NULL DEFAULT 'manual',
  gateway_provider text,           -- 'stripe' | null
  gateway_payment_id text,         -- Stripe payment intent ID
  transaction_reference text,      -- manual: bKash/bank ref
  proof_image_url text,            -- manual: uploaded receipt
  status text NOT NULL DEFAULT 'pending',  -- pending | approved | rejected | completed
  admin_note text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- RLS: org admin CRUD own, platform_owner ALL
```

**New storage bucket: `subscription-proofs`** for receipt uploads.

### Stripe Integration
Use Lovable's built-in Stripe integration for automatic payments:
- Enable Stripe via the Stripe tool
- Create Stripe products/prices matching each `platform_plan`
- New edge function `create-subscription-checkout` that creates a Stripe Checkout Session for the selected plan
- Webhook edge function `stripe-subscription-webhook` to handle `checkout.session.completed` and `invoice.paid` events — auto-updates `organization_subscriptions.payment_status` and inserts into `subscription_payments` with `status: completed`

### Frontend Changes

**1. `src/pages/AdminSubscription.tsx` — Add "Pay Now" dialog**
- "Pay Now" button on pending/overdue invoices
- Dialog with two tabs:
  - **Online Payment** tab: Shows plan price, "Pay with Card" button that redirects to Stripe Checkout. After success, redirects back with confirmation.
  - **Manual Payment** tab: Payment method dropdown (bKash/Nagad/Bank Transfer), transaction reference input, amount field, proof image upload (using `compressImage`), submit button
- Payment history section showing all `subscription_payments` for the org with status badges
- On manual submit: inserts into `subscription_payments`, notifies platform owner

**2. `src/pages/PlatformBilling.tsx` — Add "Payment Verifications" tab**
- New tab listing all `subscription_payments` with `status = 'pending'`
- Shows: agency name, amount, method, proof image (clickable preview), date
- Approve button: updates payment status to `approved`, marks invoice as `paid`, updates subscription `payment_status`, notifies agency admin
- Reject button: updates to `rejected` with admin note, notifies agency admin

**3. `src/pages/AgencyDetail.tsx` — Payment history section**
- Show recent `subscription_payments` for the specific agency in the subscription tab

### Edge Functions
- `create-subscription-checkout/index.ts` — Creates Stripe Checkout Session for the org's plan
- `stripe-subscription-webhook/index.ts` — Handles Stripe webhook events to auto-confirm payments

### Flow Summary

```text
Agency Admin                    Platform Owner
    │                                │
    ├─ Click "Pay Now"               │
    │                                │
    ├─ Option A: Stripe ────────────►│ (auto-confirmed via webhook)
    │   → Redirect to Checkout       │
    │   → Webhook confirms payment   │
    │                                │
    ├─ Option B: Manual ────────────►│
    │   → Upload proof + ref         │ ← Reviews in "Verifications" tab
    │   → Status: pending            │ → Approve/Reject
    │   ← Notification               │
    │                                │
```

### Files Changed
- 1 database migration (new table + RLS + storage bucket)
- `src/pages/AdminSubscription.tsx` — Pay Now dialog with Stripe + manual tabs
- `src/pages/PlatformBilling.tsx` — Payment Verifications tab
- `src/pages/AgencyDetail.tsx` — Payment history in subscription section
- `supabase/functions/create-subscription-checkout/index.ts` — new
- `supabase/functions/stripe-subscription-webhook/index.ts` — new

### Prerequisites
- Stripe must be enabled via the Stripe integration tool (will prompt for secret key)

