## Goal

When an agency sets an Overdraft Limit (USD) on a client, and that client's deposit (payment request) is later approved, automatically reset `profiles.overdraft_limit_usd` to `0`.

## Where it lives today

- Agency sets the value in **Client Detail → Automation Config** (`src/components/AutomationConfigTab.tsx`), which writes to `profiles.overdraft_limit_usd`.
- Deposits are approved via the `payment_requests` table — status flips to `'approved'` (already triggers `notify_on_payment_status_change`).

## Change

Add a DB trigger on `payment_requests` that, when status transitions to `'approved'` and `profiles.overdraft_limit_usd > 0` for that client, sets it back to `0`.

```text
payment_requests UPDATE (status → 'approved')
        │
        ▼
reset_overdraft_on_payment_approval()
        │
        ▼
UPDATE profiles SET overdraft_limit_usd = 0
WHERE user_id = NEW.client_id AND overdraft_limit_usd > 0
```

### Trigger function (SECURITY DEFINER, search_path = public)

- Fires `AFTER UPDATE OF status ON public.payment_requests`.
- Guard: only when `OLD.status IS DISTINCT FROM NEW.status` AND `NEW.status = 'approved'`.
- Runs the UPDATE above. Conditional (`> 0`) so it's a no-op when nothing is set, avoiding noise.
- Also logs an `audit_logs` entry (`action_type = 'overdraft_reset'`, description includes client + approved amount) so the agency can see why it changed.

### Why a trigger (not edge function / client code)

- Approval already happens in multiple places (admin UI, dunning processor, etc.). A trigger guarantees the rule applies regardless of the entry point.
- Atomic with the approval.

## Out of scope

- Loan overdue (cash withdrawals), platform invoice overdue, and client debt badge — unchanged.
- UI: no changes; the existing Automation Config form will simply show `0` after the next page load following an approval.

## Verification

1. Set `overdraft_limit_usd` for a test client to e.g. `50`.
2. Approve any pending payment request for that client.
3. Re-open Client Detail → Automation Config → field shows `0`.
4. `audit_logs` shows an `overdraft_reset` entry.

## Files

- New migration: trigger + function on `public.payment_requests`.
- No frontend changes.
