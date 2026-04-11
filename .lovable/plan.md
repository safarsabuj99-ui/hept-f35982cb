

## Fix Duplicate Payment Notifications

### Root Cause
There are **duplicate triggers** on the `payment_requests` table — likely from two different migrations creating triggers with slightly different names but calling the same function:

| Function | Trigger 1 | Trigger 2 |
|----------|-----------|-----------|
| `notify_on_payment_request_created` | `trg_notify_payment_request` | `trg_notify_payment_request_created` |
| `notify_on_payment_status_change` | `trg_notify_payment_status` | `trg_notify_payment_status_change` |

Every payment INSERT fires 2 notifications instead of 1. Same for status updates.

### Fix
One database migration to drop the duplicate triggers:

```sql
DROP TRIGGER IF EXISTS trg_notify_payment_request ON public.payment_requests;
DROP TRIGGER IF EXISTS trg_notify_payment_status ON public.payment_requests;
```

This keeps the correctly-named triggers (`trg_notify_payment_request_created` and `trg_notify_payment_status_change`) and removes the duplicates.

### Files Changed
- **Database migration only** — no code changes needed

