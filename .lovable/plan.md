
# Fix Service-Role Cross-Tenant Vulnerabilities

## The problem (confirmed by code audit)

Several edge functions use `SUPABASE_SERVICE_ROLE_KEY` (which bypasses RLS) and then trust IDs from the request body without verifying the caller is allowed to touch that org/client. A malicious admin from Org A can pass Org B's `org_id` and read/modify their data.

### Findings, by severity

**🔴 P0 — No caller verification at all (any logged-in user can hit them):**
| Function | Risk |
|---|---|
| `change-plan` | Caller passes any `org_id` → can change any agency's subscription plan |
| `data-export` | Caller passes any `org_id` → downloads complete dump (profiles, transactions, campaigns, invoices) of any agency |
| `test-connection` | Caller passes any `integration_id` → can probe any tenant's API tokens |
| `pause-campaign` | Need to verify (called by DB trigger but also user-callable) |
| `payment-gateway` | Multiple actions accept `org_id`/`invoice_id` — no caller check |

**🟡 P1 — Caller verified as "admin" but admin-role is global, not org-scoped:**
| Function | Risk |
|---|---|
| `create-client` | Admin from Org A passes `org_id` of Org B → creates client inside Org B |
| `approve-payment` | Admin from Org A approves Org B's payment requests |
| `reset-client-password` | Admin from Org A resets Org B's client passwords |

**🟢 Already correct:**
`platform-transfer`, `sync-billing-data`, `auto-import-accounts`, `payment-gateway-test`.

**🔵 Out of scope (cron/internal, not user-callable):**
sync-* family, billing-radar, dunning-processor, snapshot-mrr, sla-monitor, ad-guard-check, churn-predict, notification-digest, send-push, send-email, subscription-lifecycle, tenant-lifecycle-check, meter-usage, auto-snapshot-usd, sync-currency-rates, referral-commission, setup-platform-owner.

---

## The fix

### Step 1 — Create a shared auth helper

New file: `supabase/functions/_shared/auth.ts`. Exports:

```ts
requireCaller(req)                  // → { userId, supabaseAdmin }
requireRole(userId, role[])         // → throws 403 if caller lacks role
requireOrgAccess(userId, targetOrgId) // → throws 403 if caller.org_id !== targetOrgId
                                       //   (platform_owner bypasses)
requireClientInOrg(userId, clientId)  // → resolves client's org_id, then requireOrgAccess
```

All helpers throw a typed `AuthError` carrying status+message; callers catch once and return JSON.

### Step 2 — Patch the 8 vulnerable functions

For each function below, add at top of handler (after CORS):
1. `const { userId, supabaseAdmin } = await requireCaller(req)`
2. `await requireRole(userId, ['admin', 'platform_owner'])` (or platform_owner-only where applicable)
3. Resolve target org from the request body's identifier (org_id / client_id / integration_id / invoice_id / request_id / campaign_id) by SELECTing it
4. `await requireOrgAccess(userId, resolvedOrgId)`

| Function | Resolution lookup |
|---|---|
| `change-plan` | use `org_id` directly |
| `data-export` | use `org_id` directly |
| `test-connection` | `SELECT org_id FROM api_integrations WHERE id = integration_id` |
| `create-client` | use body `org_id` (admins can only create within own org; platform_owner bypass) |
| `approve-payment` | `SELECT org_id FROM payment_requests WHERE id = request_id` |
| `reset-client-password` | `SELECT org_id FROM profiles WHERE user_id = client_id` |
| `pause-campaign` | `SELECT org_id FROM campaigns WHERE id = campaign_id`; **skip check when called from DB trigger** (detect via service-role bearer key in Authorization header — accept either user JWT OR `SERVICE_ROLE_KEY` itself) |
| `payment-gateway` | per action: `org_id` from body for `initiate`; for callback verifications skip user check (gateway webhooks have their own signature verification) |

### Step 3 — Add an audit log for every blocked attempt

In `requireOrgAccess`, on failure insert into `audit_logs` with `action_type='cross_tenant_blocked'`, `description='caller=<id> tried org=<targetOrg>'`. This gives you a tripwire for malicious behavior in production.

### Step 4 — Verify no regression

After deploy, smoke-test each function with `supabase--curl_edge_functions`:
- as platform_owner → 200
- as admin of correct org → 200
- as admin of wrong org → 403
- unauthenticated → 401

---

## Out of scope (will not change in this plan)

- Cron/internal edge functions (no user input → not exploitable the same way)
- `self-signup` / `affiliate-signup` (public by design — separate rate-limiting plan)
- Webhook endpoints inside `payment-gateway` that verify by gateway signature
- API token encryption (separate P0 from earlier audit)
- Rate limiting (separate task)

## Files to be created/modified

**New:** `supabase/functions/_shared/auth.ts`

**Modified:** `change-plan`, `data-export`, `test-connection`, `create-client`, `approve-payment`, `reset-client-password`, `pause-campaign`, `payment-gateway` (8 `index.ts` files)

**Migration:** none (the helper writes to existing `audit_logs` table)

## Estimated effort
2–3 hours implementation + 30 min testing. Zero downtime — additive checks only.
