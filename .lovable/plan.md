
# Owner-Side Payment Gateway Configuration

Goal: instead of hardcoding gateway secrets, the **platform owner** manages all payment gateway credentials through a dedicated UI. Each agency/tenant uses whatever gateways the owner has enabled.

---

## 1. New table: `platform_payment_gateways`

Stores one row per gateway the owner connects.

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `gateway` | text | `sslcommerz` \| `stripe` \| `paddle` \| `bkash` \| `nagad` \| `manual` |
| `display_name` | text | shown to payers ("SSLCommerz", "Stripe Card", …) |
| `mode` | text | `sandbox` \| `live` |
| `is_enabled` | bool | owner toggle |
| `supported_currencies` | text[] | `['BDT']`, `['USD','EUR',…]` — drives routing |
| `priority` | int | sort order in checkout |
| `credentials` | jsonb | **encrypted via Vault** — store_id, store_pass, secret_key, webhook_secret, etc. |
| `public_config` | jsonb | non-secret display info (logo URL, fees note) |
| `created_at` / `updated_at` | timestamptz | |

RLS:
- SELECT public-safe view (`gateway`, `display_name`, `mode`, `is_enabled`, `supported_currencies`, `priority`, `public_config`) → any authenticated user (so checkout can list options).
- Full row SELECT/INSERT/UPDATE/DELETE → only `has_role(auth.uid(),'platform_owner')`.
- `credentials` JSONB never leaves the DB — only the `payment-gateway` edge function (service role) reads it.

Helper RPC `get_active_gateways_for_currency(text)` returns the public-safe list.

---

## 2. Platform owner UI — `/platform/payment-gateways`

New page in `PlatformLayout` sidebar ("Payment Gateways").

Layout:
```text
┌─ Payment Gateways ──────────────────────────────────┐
│ [+ Add Gateway]                                     │
│                                                     │
│ ┌─ SSLCommerz ─────────── [Live ●] [Enabled ✓] ──┐ │
│ │ Currencies: BDT     Priority: 1                 │ │
│ │ Store ID: ••••••8472   Last used: 2h ago        │ │
│ │ [Edit] [Test] [Disable] [Delete]                │ │
│ └─────────────────────────────────────────────────┘ │
│                                                     │
│ ┌─ Stripe ────────────── [Sandbox ●] [Enabled ✓] ┐ │
│ │ Currencies: USD, EUR, GBP                       │ │
│ │ Secret: sk_test_••••  Webhook: whsec_••••       │ │
│ │ [Edit] [Test] [Disable] [Delete]                │ │
│ └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

Add/Edit dialog is **gateway-aware** — picks the right credential schema based on `gateway`:
- **SSLCommerz**: store_id, store_password, sandbox toggle
- **Stripe**: secret_key, publishable_key, webhook_secret
- **Paddle**: api_key, webhook_secret, vendor_id
- **bKash / Nagad**: app_key, app_secret, username, password
- **Manual**: instructions text + bank details (already covered by `subscription-proofs` flow — surfaces as "Manual Bank Transfer" gateway)

[Test] button calls a `payment-gateway-test` edge function that performs a no-op auth ping (e.g. SSLCommerz token endpoint, Stripe `/v1/balance`) and shows ✅/❌ in the dialog.

---

## 3. Refactor `payment-gateway` edge function

Replace `Deno.env.get("SSLCOMMERZ_STORE_ID")` reads with a DB lookup:

```ts
const { data: gw } = await supabase
  .from("platform_payment_gateways")
  .select("credentials, mode, is_enabled")
  .eq("gateway", "sslcommerz")
  .eq("is_enabled", true)
  .maybeSingle();

if (!gw) return error("SSLCommerz not configured by platform owner");
const { store_id, store_password } = gw.credentials;
const isSandbox = gw.mode === "sandbox";
```

Same pattern added for new branches: `action === "stripe-initiate"`, `action === "stripe-webhook"`, etc. — single function, one router, one config source.

Keep all existing IPN / invoice update / dunning recovery logic untouched.

---

## 4. Smart routing in `AdminSubscription.tsx`

Replace the single "Pay via SSLCommerz" button with a dynamic list:

```tsx
const { data: gateways } = useQuery(['active-gateways', org.currency], () =>
  supabase.rpc('get_active_gateways_for_currency', { _currency: org.currency })
);

gateways.map(gw => <PayButton gateway={gw} ... />)
```

If the owner has enabled multiple gateways for the org's currency, all show up sorted by `priority`. If none, fall back to manual proof upload (existing flow).

---

## 5. Lifecycle smoke test (unchanged from previous plan)

Run the trial → grace → dunning → recovery loop on a clean tenant once **at least one** gateway is configured. Capture logs, fix gaps.

---

## Technical details

**Files to add**
- `supabase/migrations/<ts>_platform_payment_gateways.sql` (table + RLS + RPC + Vault encryption helper)
- `src/pages/PlatformPaymentGateways.tsx`
- `src/components/platform/AddGatewayDialog.tsx`
- `supabase/functions/payment-gateway-test/index.ts`

**Files to edit**
- `src/App.tsx` — add `/platform/payment-gateways` route
- `src/components/PlatformLayout.tsx` — add sidebar link
- `supabase/functions/payment-gateway/index.ts` — DB lookup + Stripe action
- `src/pages/AdminSubscription.tsx` — dynamic gateway buttons

**No changes** to RLS on existing tables, trial/dunning logic, or BDT/USD currency policy.

---

## Out of scope (deferred)

- Per-tenant gateway overrides (owner configs apply to all agencies for now)
- Paddle / bKash / Nagad — UI placeholders only; backend wiring later
- Migrating the existing `SSLCOMMERZ_*` secrets if previously set — owner just re-enters them in the UI

---

## What I need from you to start

Just approve. After approval I'll create the migration; you'll then enter your SSLCommerz / Stripe credentials directly in the new UI — no secret prompts.
