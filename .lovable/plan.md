# Upgrade: USD-First Wallet Refund

Rework refunds so admins refund **from the client's USD wallet balance** directly, instead of picking a specific payment row and working in BDT.

## New flow (what the admin sees)

1. Click **Refund** on a client (from `ClientDetail` payments tab, `PaymentRequests`, or a wallet-level button).
2. Dialog opens showing:
   - **Available to refund**: client's current USD wallet balance (e.g. `$247.30`)
   - **Auto-detected rate**: effective rate from the client's most recent approved payment (e.g. `৳121.4500 / USD`) with a small caption showing which payment it came from and its date
3. Admin types **USD refund amount** (capped at wallet balance). BDT auto-computes as `USD × rate`. Both fields remain editable if admin wants to override.
4. Admin selects **Refund from account** (agency cash / bank / MFS account) — same picker as today.
5. Admin adds a reason, clicks Refund.

## Rules

- **Cap**: refund USD ≤ current wallet balance. Hard block if over.
- **Rate source**: `amount_bdt / final_amount_usd` from the client's most recent `payment_requests` row with `status IN ('approved','refunded')`. Fallback to 120 if the client has no prior payment.
- **Standalone**: refund is not tied to a payment row. `payment_requests.status` is no longer flipped by refund actions.
- **Balances**:
  - Client wallet: debit `amount_usd` via a `transactions` row (`type=debit`, existing logic).
  - Agency account: deduct `amount_bdt` via `adjustAccountBalance` (existing helper).
- **Overdraft warning**: keep current "account will go negative" confirm-twice guard.
- **Audit**: keep `audit_logs` entry + `refunds` row for history.

## Technical changes

### Database (migration)
- `ALTER TABLE public.refunds ALTER COLUMN payment_request_id DROP NOT NULL;` — allow standalone refunds.
- Keep `mfs_fee_percent` / `effective_rate` columns (nullable, unused for standalone but preserved for old rows).
- No new tables.

### Frontend
- **`src/components/RefundDialog.tsx`** — rewrite:
  - Props change from `request: PaymentRequestLite` → `client: { id, name, org_id }`.
  - On open: fetch (a) client wallet USD balance via existing `walletBalance` helper, (b) most recent approved payment for rate derivation, (c) active agency accounts.
  - USD-first inputs; BDT auto-derives; both editable.
  - Remove "already refunded / remaining" block (no longer per-payment). Show wallet balance & derived rate provenance instead.
  - Keep overdraft guard, reason field, submit rollback logic.
- **`src/pages/ClientDetail.tsx`** — replace per-row Refund button in the Payments tab with a single **Refund Client** button in the tab header. Remove the per-payment approved-refund fetch/badges (or keep badges purely informational using `refunds` grouped by client, optional — will keep them off for simplicity).
- **`src/pages/PaymentRequests.tsx`** — replace per-row Refund action with a "Refund client" action that opens the new dialog scoped to that client (no payment link).
- Optional: add a **Refund** button on the client wallet page for parity (`ClientWallet.tsx`), same dialog.

### Untouched
- `adjustAccountBalance`, `transactions` insert shape, `audit_logs`, RLS on `refunds`.
- Old `refunds` rows with `payment_request_id` remain valid history.

## Out of scope
- Changing how MFS fees are handled on inbound payments.
- Bulk / multi-client refunds.
- Refund approval workflow (still instant, admin-only).
