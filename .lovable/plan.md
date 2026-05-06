# MFS Fee on Client Payments

When a client pays via an MFS method (bKash / Nagad), admin can apply a percentage fee at approval time. The fee is **deducted from the client's wallet credit** (USD), but the **full BDT amount still lands in the agency account**.

## Behavior

- Client submits payment of ৳1000 via bKash.
- Admin opens approval dialog → sees an **MFS Fee %** field, prefilled with `0.85` (only when method is bKash/Nagad). Editable per approval, can set to 0.
- Effective BDT used for wallet credit = `1000 × (1 - 0.85/100)` = ৳991.50
- Wallet credit (USD) = `991.50 / exchange_rate` per platform
- Agency account receives the full ৳1000 (unchanged).
- Description on the wallet transaction notes the fee, e.g. `... (MFS fee 0.85% deducted)`.
- Audit log records the fee % and BDT amount deducted.
- For non-MFS methods (Bank, Cash) → no fee field shown, behavior unchanged.

## Technical changes

### 1. UI — `src/pages/PaymentRequests.tsx` approval modal
- Detect MFS method: `["bkash","nagad"].includes(payment_method.toLowerCase())`.
- Add numeric input **MFS Fee (%)**, default `0.85`, only visible for MFS.
- Show live breakdown: Gross ৳1000 → Fee ৳8.50 → Net ৳991.50 → Wallet $X.XX.
- Pass `mfs_fee_percent` to `approve-payment` edge function in the request body.

### 2. Edge function — `supabase/functions/approve-payment/index.ts`
- Accept new optional param `mfs_fee_percent: number` (0–10).
- Compute `effectiveBdt = totalBdt * (1 - feePct/100)` used **only** for USD conversion.
- For multi-platform: apply the same percentage to each platform's BDT before dividing by its rate.
- Agency account credit still uses original `totalBdt` (no change there).
- Append `(MFS fee X% = ৳Y)` to transaction description and audit log.
- If method is not bKash/Nagad, ignore `mfs_fee_percent` (force 0) as a safety guard.

### 3. No DB schema change
- Fee is transient (per-approval). No new columns needed; the deduction is already reflected in the smaller `final_amount_usd` and the transaction description carries the audit detail.

## Files to edit
- `src/pages/PaymentRequests.tsx` — add fee input + breakdown in approval dialog.
- `supabase/functions/approve-payment/index.ts` — apply fee to USD conversion only.
