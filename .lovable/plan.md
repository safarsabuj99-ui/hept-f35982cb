## Add Refund button to Client Detail → Payments tab

The Refund system already exists (`RefundDialog`, DB schema, refund logic used on `/admin/payment-requests`). Only the entry point is missing on the per-client page.

### Changes

**`src/pages/ClientDetail.tsx`**
1. Import `RefundDialog` and `Undo2` icon; add `refundDialog` state (`{ open, request }`).
2. In `fetchAll`, extend the `payment_requests` select to include the fields `RefundDialog` needs: `exchange_rate_snapshot`, `platform_amounts`, `paid_to_account_id`, `org_id`, `client_id`.
3. Also fetch approved-refund totals (`SELECT payment_request_id, sum(amount_bdt)` from `refunds`) and attach `refunded_bdt` to each payment row so partial-refund state is visible.
4. In the Payments table:
   - Add an **Actions** column (admin-only, gated by existing role check used elsewhere in the file).
   - Show a **Refund** button (`variant="outline"`, `Undo2` icon) on rows where `status === 'approved'` and `refunded_bdt < amount_bdt`.
   - Show a small "Partial refund: ৳X" / "Fully refunded" badge next to the status badge when applicable.
5. Mount `<RefundDialog>` at the end of the component, passing `onSuccess={fetchAll}` to refresh balances and refund totals after a refund.

### Out of scope
- No changes to refund logic, DB, or the existing dialog.
- No changes to non-admin views.
