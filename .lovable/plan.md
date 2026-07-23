## Fix: Payments tab shows "No payment requests" on Client Detail

### Root cause (verified)

`src/pages/ClientDetail.tsx` (line 147) selects `paid_to_account_id` from `payment_requests`, but that column does not exist. The actual column is `received_in_account_id`. PostgREST rejects the whole query, `paymentsRes.data` is `null`, and the Payments tab renders the empty state — even though the DB has 10+ approved payment requests for this client.

This was introduced in the last turn when the refund button was added and `RefundDialog`'s required fields were appended to the select.

### Change

**`src/pages/ClientDetail.tsx` (line 147)** — rename the column in the select:

- `paid_to_account_id` → `received_in_account_id`

Then, wherever the loaded payment row is passed into `<RefundDialog>` (the refund button click handler / `refundDialog` state population), map it so the dialog still receives its expected `paid_to_account_id` field:

```ts
setRefundDialog({ open: true, request: { ...p, paid_to_account_id: p.received_in_account_id } })
```

(or read `received_in_account_id` directly if `RefundDialog` is updated to accept both — but keeping the fix scoped to this file is safer.)

### Out of scope

- No DB migration. The column name in the DB is correct as-is; only the client query is wrong.
- No changes to `RefundDialog`, `PaymentRequests.tsx`, or any other page.
- No changes to refund logic or UI.

### Why this won't recur

The fix uses the real column name, so the query will succeed. If a future edit reintroduces a wrong column, PostgREST will fail loudly — the deeper prevention (typed Supabase queries flagging bad column names at build time) is out of scope for this bug.
