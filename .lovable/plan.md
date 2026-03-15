

## Plan: Fix Deposit Request Using Admin ID Instead of Client ID During Impersonation

### Problem
When an admin impersonates a client (via "View as Client") and submits a deposit request from the client dashboard or wallet, the request is created with the **admin's user ID** instead of the **impersonated client's ID**. This happens because both `ClientDashboard.tsx` and `ClientWallet.tsx` pass `clientId={user?.id}` (the authenticated admin) to `DepositFundsDialog`, even though they already have the correct `effectiveClientId` from `useImpersonation()`.

### Root Cause
Two lines, one in each file:
- `ClientDashboard.tsx` line 359: `clientId={user?.id}` 
- `ClientWallet.tsx` line 311: `clientId={user?.id}`

Both should use `effectiveClientId` which correctly resolves to the impersonated client's ID when admin is impersonating, or the logged-in user's own ID otherwise.

### Fix

| File | Change |
|------|--------|
| `src/pages/ClientDashboard.tsx` | Line 359: Change `clientId={user?.id}` → `clientId={effectiveClientId ?? undefined}` |
| `src/pages/ClientWallet.tsx` | Line 311: Change `clientId={user?.id}` → `clientId={effectiveClientId ?? undefined}` |

Two single-line changes. No other files affected.

