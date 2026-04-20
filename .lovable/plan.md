

## Fix: "invalid input value for enum campaign_request_status: 'approved'" on reject/delete

### Root cause (verified in DB)

The trigger `notify_on_campaign_request` on `public.campaign_requests` runs on every UPDATE and contains:

```sql
IF NEW.status IN ('approved', 'rejected') THEN
  ... 'Campaign Approved ✅' ...
```

But the enum `campaign_request_status` only has these values:

```
pending | processing | completed | rejected
```

There is **no `'approved'`** value. When PostgreSQL parses the `IN ('approved', 'rejected')` clause, it tries to cast both literals to the enum type. The cast of `'approved'` fails immediately, throwing:

> `invalid input value for enum campaign_request_status: "approved"`

This error fires on **any UPDATE** that changes `status` — including the Reject action (the red ❌ button the user is calling "delete"). It also silently broke "Completed" notifications, because the trigger was checking `'approved'` instead of the actual `'completed'` value used everywhere in the app.

### Bonus finding

The red ❌ icon in the screenshot is the **Reject** button, not a delete button. There is no delete-request action in `OrderManagement.tsx`. If the user wants true deletion, that's a separate feature — confirm before adding.

### The fix

**Single migration** — rewrite `notify_on_campaign_request` so its UPDATE branch matches the actual enum values (`completed` and `rejected`), and the success message says "Completed" instead of "Approved":

```sql
-- In the UPDATE branch:
IF NEW.status IN ('completed', 'rejected') THEN
  INSERT INTO public.notifications (...)
  VALUES (
    NEW.client_id,
    CASE WHEN NEW.status = 'completed'
      THEN 'Campaign Completed ✅'
      ELSE 'Campaign Rejected ❌'
    END,
    'Your campaign request "' || ... || '" was ' || NEW.status::text
      || CASE WHEN NEW.status = 'rejected' AND NEW.rejection_reason IS NOT NULL
        THEN '. Reason: ' || NEW.rejection_reason ELSE '' END,
    'campaign',
    '/dashboard/campaigns?highlight=' || NEW.id::text,
    v_org_id,
    CASE WHEN NEW.status = 'rejected' THEN 'urgent' ELSE 'normal' END
  );
END IF;
```

Everything else in the trigger (INSERT branch, admin notifications) stays the same.

### Files Changed

| File | Change |
|---|---|
| `supabase/migrations/<new>.sql` | `CREATE OR REPLACE FUNCTION public.notify_on_campaign_request` — replace `'approved'` with `'completed'` in the IN clause and CASE expressions; update the title from "Campaign Approved ✅" to "Campaign Completed ✅" |

Zero frontend changes. Zero schema/enum changes. Trigger keeps its name and binding.

### What you'll see after the fix

- Clicking the red ❌ → entering a rejection reason → request status updates to `rejected`, client gets an "Campaign Rejected ❌" notification with the reason. No more enum error.
- Clicking the green ✓ → status updates to `completed`, client now correctly receives a "Campaign Completed ✅" notification (which was silently broken before).
- Starting processing (▶) and pending → no notification, same as before.

### Build time
~2 minutes. One migration. No code changes, no breaking changes.

