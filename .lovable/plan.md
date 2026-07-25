## Root cause

The `refunds` table's RLS `WITH CHECK` requires `org_id = get_user_org_id(auth.uid())`, but the insert can end up with `org_id = NULL` (the dialog passes `client.org_id ?? undefined`, and unlike `transactions` there is **no BEFORE INSERT trigger** to populate it). NULL fails the check → "new row violates row-level security policy for table refunds".

Verified:
- `refunds.org_id` is nullable with no default.
- No triggers on `refunds` (compare to `transactions`, which has `trg_set_transaction_org_id` using `set_org_id_from_auth`).
- Policy `admin_all_refunds` requires org match on both `USING` and `WITH CHECK`.

## Fix

1. **Migration** — add a BEFORE INSERT trigger on `public.refunds` that populates `org_id` from `get_user_org_id(auth.uid())` when NULL (reusing the existing `set_org_id_from_auth` function, matching the pattern used on `transactions`, `campaigns`, etc.). This is the durable fix so future insert paths can't regress.

2. **RefundDialog hardening** — also send `org_id` explicitly in the `refunds` insert, falling back to the admin's own org via a quick `profiles` lookup when `client.org_id` is missing. Belt-and-suspenders with the trigger.

3. **Validation** — retry the refund from Client Detail; confirm the row inserts and both the transaction and refund audit rows land with the correct `org_id`.

No changes to policies, grants, or the refund business logic.