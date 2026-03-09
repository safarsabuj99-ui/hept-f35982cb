

# Plan: Optimize System Logs — High-Signal Only

## Problem
The `audit_transaction_change` trigger logs **every** transaction insert/update, including automated `auto_spend` debits that happen hundreds of times daily. This drowns out important events.

## Strategy: Filter Noise at Source + Add Missing Important Events

### 1. Fix the noisy trigger (DB migration)
Update `audit_transaction_change` to **skip auto_spend debits** — these are routine system events, not admin-actionable:

```sql
-- Skip if description starts with 'auto_spend:'
IF TG_OP = 'INSERT' AND NEW.description LIKE 'auto_spend:%' THEN
  RETURN NEW;
END IF;
```

This keeps only manual credits/debits (human-driven financial events) in logs.

### 2. Add missing important action types

Add new audit log inserts for critical events not currently tracked:

| New Action Type | Where to Add | Why Important |
|---|---|---|
| `payment_approved` | `approve-payment/index.ts` | Admin approved a client payment — financial accountability |
| `payment_rejected` | `approve-payment/index.ts` | Admin rejected a payment — needs audit trail |
| `client_password_reset` | `reset-client-password/index.ts` | Security-sensitive action |
| `platform_transfer` | `platform-transfer/index.ts` | Money moved between agency accounts |

### 3. Add action type filter dropdown to UI

Add a `Select` dropdown to filter logs by action type, so admins can quickly find specific events. Also add color badges for the new action types.

### 4. Add severity/priority indicator

Group action types by severity and show a colored dot:
- **Critical** (red): `ad_guard_critical_error`, `transaction_rejected`, `payment_rejected`
- **Warning** (amber): `ad_guard_pause`, `exchange_rate_changed`, `client_password_reset`
- **Info** (blue): `client_created`, `client_impersonation`, `campaign_paused`
- **Success** (green): `funds_added`, `transaction_completed`, `payment_approved`, `platform_transfer`

## Files to Modify

1. **DB Migration** — Update `audit_transaction_change` trigger to skip `auto_spend` descriptions
2. **`supabase/functions/approve-payment/index.ts`** — Add `payment_approved`/`payment_rejected` audit log inserts
3. **`supabase/functions/reset-client-password/index.ts`** — Add `client_password_reset` audit log insert
4. **`supabase/functions/platform-transfer/index.ts`** — Add `platform_transfer` audit log insert
5. **`src/pages/AuditLogs.tsx`** — Add action type filter dropdown, severity dots, new color mappings, and a summary stats bar at top (total logs today, critical count)

## Result
- Dramatically fewer noisy rows (no auto_spend flood)
- All security/financial-critical events tracked
- Filterable by action type for quick investigation
- Visual severity indicators for at-a-glance triage

