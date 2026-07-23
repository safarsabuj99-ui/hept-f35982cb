## Goal
Make refunds respect the MFS fee logic used at approval so the client's USD wallet and the agency's BDT account always reverse the exact amounts that were originally posted — no calculation drift.

## Current behavior (the bug)

On approval of an MFS payment (bKash / Nagad):
- Agency BDT account receives the **full** `amount_bdt` (fee stays with the agency as its cost of collecting via MFS).
- Client USD wallet is credited **net of fee**: `USD = (amount_bdt × (1 − fee%)) / rate`.
- `payment_requests.final_amount_usd` stores the net USD; the fee% itself is not stored (only mentioned in the transaction description).

On refund today (`RefundDialog`):
- Admin types BDT + rate; USD is computed as `BDT / rate`.
- This ignores the fee, so refunding an MFS deposit debits the client's wallet **more USD than they were ever credited**, and the numbers stop matching the original approval.

## Fix (system-friendly, no recalculation guesswork)

Anchor the refund math to what was actually posted at approval, not to a re-entered rate.

### 1. Persist the fee at approval time
- Add `mfs_fee_percent numeric` to `public.payment_requests` (nullable, defaults NULL for non-MFS).
- `approve-payment` writes the `feePct` it already computes into this column when updating the request to `approved`.
- Backfill existing approved MFS rows by deriving the implied fee from `amount_bdt`, `final_amount_usd`, and `exchange_rate_snapshot` (single-rate: `1 − final_usd × rate / amount_bdt`; multi-rate: use the average of the snapshot, same convention `RefundDialog` already uses for display).

### 2. Derive refund USD proportionally, not from a re-entered rate
In `RefundDialog`:
- Compute an **effective all-in rate** for the payment once: `effRate = amount_bdt / final_amount_usd`. This rate already bakes in the MFS fee and any multi-platform blending, so using it guarantees reversal parity.
- Default `USD refund = refund_bdt / effRate` (equivalently `refund_bdt / amount_bdt × final_amount_usd`, rounded to 2 dp).
- Show the rate field pre-filled with `effRate` and labelled "Effective rate (fee-adjusted)" with a small hint: "Original ৳X → $Y, fee Z%". Still editable for edge cases, but the default now reverses cleanly.
- Keep the existing "editable USD" override for admin discretion.

### 3. Record the fee on the refund row for audit
- Add `mfs_fee_percent numeric` and `effective_rate numeric` to `public.refunds`.
- `RefundDialog` writes both when inserting the refund, so the audit trail shows what fee assumption was applied.

### 4. Cash flow stays truthful
- Agency BDT account is debited exactly `refund_bdt` (what left the account), matching what was originally received — no change to that leg, this already works.
- Client USD wallet is debited the fee-adjusted USD from step 2 — matches what was credited.
- Partial refund tracking (`refundedSoFar`, "Partial refund" badges) continues to work unchanged because it's BDT-based.

### 5. Guardrail
Add a soft warning in `RefundDialog` when the admin's edited USD differs from the computed fee-adjusted USD by more than 1%, so accidental overrides are flagged before submit.

## Files touched
- Migration: add `mfs_fee_percent` to `payment_requests`, add `mfs_fee_percent` + `effective_rate` to `refunds`, backfill existing approved MFS rows.
- `supabase/functions/approve-payment/index.ts` — persist `mfs_fee_percent` on the update.
- `src/components/RefundDialog.tsx` — compute effective rate, default USD from it, show fee context, add drift warning, write new refund columns.
- `src/pages/PaymentRequests.tsx` and `src/pages/ClientDetail.tsx` — include `mfs_fee_percent` in the fields fetched for the refund dialog (no UI change beyond that).

## Out of scope
- No change to how the fee is charged at approval time.
- No change to non-MFS payments (fee% stays NULL → effective rate collapses to the plain rate, behavior is identical to today).
