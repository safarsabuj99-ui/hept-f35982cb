

## Plan: Advanced Affiliate System with Independent Dashboard

### What We're Building

A completely standalone affiliate system where external marketers (not agencies) can register, log in, get unique tracking links, and earn commissions when clients sign up and purchase through their links. Platform owner controls commission rates per affiliate.

### Architecture

```text
┌─────────────────────────────────────────────┐
│  Public                                      │
│  /affiliate/register  → Affiliate signup     │
│  /affiliate/login     → Affiliate login      │
│  /signup?ref=CODE     → Tracked client signup│
├─────────────────────────────────────────────┤
│  Affiliate Portal (/affiliate/*)             │
│  /affiliate           → Dashboard (KPIs)     │
│  /affiliate/links     → Generate/manage links│
│  /affiliate/earnings  → Commission history   │
│  /affiliate/payouts   → Payout requests      │
│  /affiliate/profile   → Edit profile/bank    │
├─────────────────────────────────────────────┤
│  Platform Owner (/platform/affiliates)       │
│  - View all affiliates                       │
│  - Set per-affiliate commission rate         │
│  - Approve/reject payout requests            │
│  - View performance analytics                │
└─────────────────────────────────────────────┘
```

### Database Changes (Migration)

**New tables:**

1. **`affiliates`** — Affiliate accounts (linked to auth.users)
   - `id`, `user_id` (FK auth.users), `full_name`, `email`, `phone`, `payment_method` (bKash/Nagad/Bank), `payment_details` (JSONB), `commission_rate` (percentage, default 10, individually settable), `commission_type` (percentage/fixed), `status` (pending/active/suspended), `created_at`

2. **`affiliate_links`** — Tracking links
   - `id`, `affiliate_id` (FK affiliates), `code` (unique slug), `label` (custom name), `clicks` (counter), `is_active`, `created_at`

3. **`affiliate_conversions`** — Tracks signups + purchases
   - `id`, `affiliate_id`, `link_id`, `referred_org_id` (FK organizations), `signup_at`, `first_payment_at`, `payment_amount_bdt`, `commission_bdt`, `status` (pending/qualified/paid/rejected), `qualified_at`, `paid_at`

4. **`affiliate_payouts`** — Payout requests from affiliates
   - `id`, `affiliate_id`, `amount_bdt`, `status` (pending/approved/paid/rejected), `payment_method`, `payment_details`, `admin_note`, `requested_at`, `processed_at`

**New role:** Add `'affiliate'` to `app_role` enum.

**Modify:** `organizations` table — add `referred_by_affiliate_id` column.

### New Edge Function

**`affiliate-signup`** — Creates auth user + affiliate profile + assigns affiliate role. No agency/org creation needed.

### Frontend Pages

| File | Purpose |
|------|---------|
| `src/pages/AffiliateRegister.tsx` | Public signup form (name, email, password, phone, payment info) |
| `src/pages/AffiliateLogin.tsx` | Login page for affiliates |
| `src/pages/AffiliateDashboard.tsx` | KPIs: Total earnings, pending, clicks, conversions, conversion rate |
| `src/pages/AffiliateLinks.tsx` | Generate links with custom labels, copy URL, see click counts |
| `src/pages/AffiliateEarnings.tsx` | Conversion history table with status badges |
| `src/pages/AffiliatePayouts.tsx` | Request payout, view payout history |
| `src/pages/AffiliateProfile.tsx` | Edit name, phone, payment details |
| `src/components/AffiliateLayout.tsx` | Sidebar layout for affiliate portal |
| `src/pages/PlatformAffiliates.tsx` | Platform owner: manage affiliates, set rates, approve payouts |

### Conversion Tracking Flow

1. Affiliate generates link → `https://yoursite.com/signup?ref=ABC123`
2. Client visits link → click counter increments (edge function or client-side)
3. Client signs up → `organizations.referred_by_affiliate_id` is set
4. Client makes first payment (subscription approved) → conversion marked `qualified`, commission calculated using that affiliate's individual `commission_rate`
5. Affiliate requests payout → Platform owner approves → status becomes `paid`

### Commission Logic

- Each affiliate has their own `commission_rate` and `commission_type` (percentage or fixed)
- Platform owner can edit per-affiliate from the management page
- Default rate set when affiliate is approved
- Commission calculated on first subscription payment of referred agency

### Routing Updates (App.tsx)

```text
/affiliate/register   → Public
/affiliate/login      → Public  
/affiliate/*          → ProtectedRoute (role: affiliate) + AffiliateLayout
/platform/affiliates  → Platform owner page
```

### Signup Page Update

Modify `src/pages/Signup.tsx` to read `?ref=CODE` from URL, store in state, and pass to the `self-signup` edge function which saves `referred_by_affiliate_id` on the organization.

### Platform Sidebar Update

Add "Affiliates" nav item under Agencies section in `PlatformLayout.tsx`.

### Files Changed/Created

| Action | File |
|--------|------|
| Create | `src/pages/AffiliateRegister.tsx` |
| Create | `src/pages/AffiliateLogin.tsx` |
| Create | `src/pages/AffiliateDashboard.tsx` |
| Create | `src/pages/AffiliateLinks.tsx` |
| Create | `src/pages/AffiliateEarnings.tsx` |
| Create | `src/pages/AffiliatePayouts.tsx` |
| Create | `src/pages/AffiliateProfile.tsx` |
| Create | `src/components/AffiliateLayout.tsx` |
| Create | `src/pages/PlatformAffiliates.tsx` |
| Create | `supabase/functions/affiliate-signup/index.ts` |
| Modify | `src/App.tsx` — Add affiliate routes |
| Modify | `src/components/PlatformLayout.tsx` — Add Affiliates nav |
| Modify | `src/hooks/useAuth.tsx` — Add `affiliate` to AppRole |
| Modify | `src/pages/Signup.tsx` — Read `?ref=` param |
| Migration | New tables + enum update + RLS policies |

