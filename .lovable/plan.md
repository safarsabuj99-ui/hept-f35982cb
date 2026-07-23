# Refund System for Client Deposits

Let agencies refund an approved payment request (fully or partially) back to a client, deducting from a chosen agency account and reversing the client's wallet balance — with the original exchange rate pre-filled and editable.

## Behavior

1. On every **approved** `payment_requests` row, admins see a new **Refund** action.
2. Refund dialog opens with smart defaults:
   - **Refund from account** → defaults to the original `received_in_account_id` (editable — any active `agency_accounts` row).
   - **Refund BDT amount** → defaults to the remaining refundable amount (original BDT − already-refunded BDT).
   - **Exchange rate** → defaults to the original `exchange_rate_snapshot` (single rate, or per-platform if multi-platform deposit). Editable.
   - **Refund USD** → auto-computed as `BDT / rate`, live-updated. Also editable if admin needs manual override.
   - **Reason / note** (required, min 5 chars).
3. On submit:
   - Validate: amount > 0, amount ≤ remaining refundable, source account exists, rate > 0.
   - Deduct BDT from the chosen agency account via `adjustAccountBalance(account_id, -bdt)`.
   - Insert a `debit` transaction (type='debit', status='completed', amount=refund_usd, description="Refund: <note>", exchange_rate=rate) → this reduces the client's USD wallet balance through existing balance logic.
   - Insert a `refunds` row linking to the original payment request (audit trail + partial-refund tracking).
   - If total refunded ≥ original amount, flip `payment_requests.status` to `refunded`; otherwise leave as `approved` (partial).
   - Fire notification to the client: "Refund of ৳X issued".
4. Refunded / partially-refunded requests show a **Refunded ৳X of ৳Y** badge and cannot be re-approved.
5. Client wallet history shows the refund as a debit line with the note.

## Where refunds appear

- **Admin → Payment Requests page**: Refund button on approved rows (with tooltip showing remaining refundable).
- **Client Detail → Wallet/Payments tab**: same Refund button next to each approved deposit.

## Safeguards

- Cannot refund more than `original_bdt - sum(prior_refunds_bdt)`.
- Cannot refund if the chosen source account would go negative (warn + require confirm to allow overdraft).
- Refund action is admin-only, gated by `has_role('admin')` and org isolation.
- All refunds logged to `audit_logs` (action_type = `payment_refunded`).
- Refund cannot be edited/deleted once issued — to reverse, admin issues a new credit transaction.

## Technical Details

### Database migration
- New table `public.refunds`:
  - `id`, `payment_request_id` (FK), `client_id`, `org_id`
  - `refunded_from_account_id` (FK → agency_accounts)
  - `amount_bdt`, `exchange_rate`, `amount_usd`
  - `note`, `refunded_by` (FK → auth.users), `created_at`
  - GRANTs (authenticated + service_role), RLS: admin all within org, client SELECT own.
  - BEFORE INSERT trigger to auto-fill `org_id` from payment request.
- Extend `payment_request_status` enum with `'refunded'`.
- Helper view / RPC `get_refundable_amount(payment_request_id)` returning `original_bdt - COALESCE(sum(refunds.amount_bdt), 0)` for efficient UI checks.

### Frontend
- New component `src/components/RefundDialog.tsx` (mirrors `DepositFundsDialog` structure): account picker, BDT input, rate input (per-platform when snapshot is jsonb object), computed USD, note field, submit handler.
- Hook up in `src/pages/PaymentRequests.tsx` (row action + refunded badge) and `src/pages/ClientDetail.tsx` payments list.
- Wallet history in `ClientWallet.tsx` / `WalletInventory.tsx` already renders debit transactions — the "Refund:" description prefix will render naturally; add a red "Refund" badge when description starts with `Refund:`.

### Balance flow (reuses existing atomic helpers)
```text
adjustAccountBalance(source_account, -refund_bdt)   // agency cash out
INSERT transactions (type=debit, amount=refund_usd) // client wallet down
INSERT refunds (...)                                // audit + partial tracking
UPDATE payment_requests SET status='refunded' if fully refunded
```

No edge function needed — all client-side with RLS-protected writes, matching the existing deposit approval pattern.
