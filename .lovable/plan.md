
# Commercial / Billing Hardening Plan

Goal: make the app capable of accepting **real money today**, globally and in BD, and prove the trial → grace → dunning → recovery loop works on a clean tenant.

---

## 1. Dual payment rails (smart routing)

Keep SSLCommerz for BDT customers, add Stripe for everyone else. Route by org country / currency, with manual override.

### 1a. Activate SSLCommerz (BD rail)
The `payment-gateway` edge function is already coded — it just needs live credentials.

Request 3 secrets via `add_secret`:
- `SSLCOMMERZ_STORE_ID`
- `SSLCOMMERZ_STORE_PASSWORD`
- `SSLCOMMERZ_SANDBOX` (`true` for first test, then flip to `false`)

No code change needed — function already reads these.

### 1b. Enable Stripe (global rail)
Use Lovable's **built-in seamless Stripe payments** (`enable_stripe_payments`) — no API key paste, no Stripe account claim required to start testing. Sandbox is created instantly.

Workflow:
1. Run `recommend_payment_provider` (required pre-check)
2. Enable Stripe payments
3. Choose tax handling: recommend **`automatic_tax`** (calc + collect, user files) — fits a multi-region SaaS without locking out non-eligible Stripe seller countries
4. Create the same plan SKUs already in `subscription_plans` as Stripe products via `batch_create_product`
5. Add `stripe-checkout` + `stripe-webhook` edge functions mirroring the SSLCommerz IPN flow (mark invoice paid → extend subscription → activate org → notify → recover dunning)

### 1c. Routing layer
In `AdminSubscription.tsx` "Pay now" UI:
- Detect org currency / country from `organizations` row
- BD / BDT → SSLCommerz
- Everywhere else → Stripe
- Show both buttons with the recommended one primary; let user override

Backend: extend `gateway_transactions.gateway` enum to include `stripe`.

---

## 2. Lifecycle smoke test on clean tenant

Create a throwaway org and walk the full money loop:

```text
signup (trial=14d)
   → connect 1 ad account
   → run sync-fast-lane
   → subscription-lifecycle marks trial_ending at T-3
   → trial expires → SubscriptionGate blocks app
   → dunning-processor creates invoice + email
   → pay via Stripe sandbox (4242 4242 …) and SSLCommerz sandbox
   → webhook/IPN flips invoice=paid, subscription=active
   → dunning_runs.status=recovered
   → org returns to normal
```

For each step, capture: edge function logs, DB row deltas, notification fired. Fix any gap found (most likely: dunning email template, gateway → invoice linkage on Stripe side, grace-period banner copy).

A short Deno test (`supabase/functions/payment-gateway/lifecycle_test.ts`) will assert the IPN happy-path against a mocked SSLCommerz response so regressions are caught.

---

## Technical details

- **Files to add**
  - `supabase/functions/stripe-checkout/index.ts`
  - `supabase/functions/stripe-webhook/index.ts` (verify_jwt = false in `config.toml`)
  - `supabase/functions/payment-gateway/lifecycle_test.ts`
- **Files to edit**
  - `src/pages/AdminSubscription.tsx` — dual-button routing + currency detection
  - `src/components/SubscriptionGate.tsx` — make sure CTA points to chosen gateway
  - `supabase/config.toml` — add `[functions.stripe-webhook]` block
- **DB migration** — extend gateway enum, add index on `gateway_transactions(org_id, status)` for dunning lookups
- **No changes** to existing SSLCommerz logic, trial logic, or RLS

---

## Out of scope

- Paddle (Stripe + SSLCommerz already cover global + BD)
- Replacing manual proof-upload (kept as fallback for bKash/Nagad direct)
- Legal pages / DPA (separate launch task)
- Email DKIM / deliverability (separate)

---

## What I need from you to start

1. Confirm: **enable Stripe via Lovable Payments** (recommended) or BYOK Stripe?
2. Have your **SSLCommerz live (or sandbox) Store ID + Password** ready — I'll trigger the secret prompt as soon as you approve.
