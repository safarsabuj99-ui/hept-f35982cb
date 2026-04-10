

## Self-Service Agency Signup Flow

### What It Does
When a visitor clicks "Get Started" on the landing page, they go through a guided multi-step flow:
1. **Select Plan** — Browse all available plans with pricing, limits, and features
2. **Sign Up** — Create their account (name, email, password, agency name)
3. **Payment** — Submit manual payment with proof (bKash, Nagad, Bank Transfer)
4. **Pending State** — Account created but in "pending_payment" status until platform owner approves

Once the platform owner approves the payment, the organization status changes to "trial"/"active" and the agency admin gets full access.

### Database Changes

**New table: `self_signup_requests`**
- Stores the full signup + plan + payment details before account creation
- Fields: `id`, `full_name`, `email`, `password_hash` (won't store raw password — we'll use a different approach), `agency_name`, `plan_key`, `billing_cycle`, `payment_method`, `transaction_reference`, `proof_image_url`, `status` (pending/approved/rejected/expired), `admin_note`, `reviewed_by`, `reviewed_at`, `created_at`
- RLS: platform_owner full access, anon insert only

**Alternative approach (simpler, recommended):** Instead of storing credentials in a pending table, create the auth user + organization immediately but set `organizations.status = 'pending_payment'`. The `ProtectedRoute` component will show a "Payment Pending" screen instead of the admin dashboard until approved. This avoids storing passwords.

**Chosen approach: Immediate creation with pending status**
- No new table needed
- New edge function `self-signup` that creates auth user, organization, subscription, and payment record — all without requiring an authenticated caller (unlike `create-client` which requires admin role)
- Organization created with `status = 'pending_payment'`

### Edge Function: `supabase/functions/self-signup/index.ts`
- No auth required (public endpoint for new signups)
- Accepts: `full_name`, `email`, `password`, `agency_name`, `plan_key`, `billing_cycle`, `payment_method`, `transaction_reference`, `proof_image_url`
- Creates auth user with `email_confirm: true`
- Creates organization with `status = 'pending_payment'`
- Assigns `admin` role to user
- Creates `organization_subscriptions` record
- Creates `subscription_payments` record with proof
- Sends notification to platform owner
- Returns `{ success: true, user_id }`

### Frontend Changes

**1. New page: `src/pages/Signup.tsx`** — Multi-step wizard
- **Step 1 — Choose Plan**: Fetches `platform_plans`, displays cards with limits/pricing, monthly/yearly toggle. User selects one.
- **Step 2 — Account Details**: Agency name, full name, email, password, confirm password. Client-side validation.
- **Step 3 — Payment**: Payment method selector (bKash, Nagad, Bank Transfer), transaction reference input, proof image upload (to `subscription-proofs` bucket via public upload). Shows payment instructions (account numbers etc. from a config or hardcoded).
- **Step 4 — Confirmation**: "Your signup is under review. You'll receive access once payment is verified."

**2. `src/App.tsx`** — Add `/signup` route (public, no auth)

**3. `src/pages/LandingPage.tsx`** — Change all "Get Started" / CTA links from `/login` to `/signup`

**4. `src/components/ProtectedRoute.tsx`** — When admin user's org has `status = 'pending_payment'`, show a "Payment Under Review" screen instead of redirecting to dashboard

**5. `src/pages/PlatformBilling.tsx`** — The existing Verifications tab already handles `subscription_payments` approval. On approval, update `organizations.status` from `pending_payment` to `trial` (with trial_ends_at set).

### Flow Summary
```text
Landing Page → [Get Started] → /signup
  Step 1: Select Plan
  Step 2: Fill Account Details
  Step 3: Submit Payment Proof
  Step 4: "Under Review" confirmation
  
Platform Owner → Platform Billing → Verifications tab
  → Approve payment → org status → trial → user gets access
```

### Files Changed
- `supabase/functions/self-signup/index.ts` — new edge function
- `src/pages/Signup.tsx` — new multi-step signup wizard
- `src/App.tsx` — add `/signup` route
- `src/pages/LandingPage.tsx` — update CTA links to `/signup`
- `src/components/ProtectedRoute.tsx` — handle `pending_payment` org status
- `src/pages/PlatformBilling.tsx` — on approval, set org status to `trial`
- 1 database migration — add `pending_payment` to `org_status` enum

