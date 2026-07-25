## Problem

`RefundDialog` shows **"Available to refund: $0.00"** and **"No prior payments — using default rate ৳120"** for clients that clearly have both.

## Root cause (confirmed by DB)

For client `9e2fa8d9…`:
- `transactions` (completed): **87 credits totaling $8,496.44** + **1,169 debits totaling $8,393.93** → true wallet balance **≈ $102.51**.
- The dialog query in `src/components/RefundDialog.tsx` (line 68) selects transactions **without pagination or aggregation**. Supabase caps the response at **1,000 rows**, so only the most recent slice (all debits in this case) is returned. `computeWalletBalance` then sees a negative total, and `availableUsd = Math.max(0, walletUsd)` → **$0**.
- Same class of bug applies to the rate detection: it works for this client (last approved payment has `exchange_rate_snapshot = {meta: 145}`, so 145 would be derived), but the code path is fragile — for the client in the screenshot (MUSA) the query genuinely returns nothing, so it falls back to ৳120. We should also fall back to any completed **credit** transaction's `exchange_rate` before dropping to the default.

## Fix

Keep this a scoped UI/data-fetching fix inside `RefundDialog.tsx` — no schema, no RLS changes.

1. **Replace the truncated transactions fetch with an aggregated one** so pagination can never lie:
   - Query only what's needed: `SELECT type, amount, platform` filtered to `status='completed'` — but use `fetchAllRows` (already in `src/lib/fetchAllRows.ts`) to paginate through **every** row before calling `computeWalletBalance`.
   - This preserves the existing `computeWalletBalance` contract (per-platform buckets, rounding) and keeps `computeBdtDebt` behaviour intact.

2. **Harden rate detection** so it doesn't silently drop to ৳120 when it shouldn't:
   - Keep the current `payment_requests` lookup (approved/refunded, latest first).
   - If that returns nothing OR yields a non-positive rate, fall back to the most recent completed **credit** in `transactions` that has a positive `exchange_rate`.
   - Only if both fail, use ৳120 and keep the "No prior payments" hint.
   - Surface the source of the rate in the small caption already in the dialog (e.g. "From last deposit transaction on …") so admins can tell which source was used.

3. **Guard against the same bug elsewhere**: quick grep for other places that call `.from("transactions").select(...).eq("client_id", ...)` without pagination when computing wallet balance client-side (e.g. `ClientDetail`, `PaymentRequests`, `ClientWallet`). If any are found, switch them to `fetchAllRows` too. Scope this to wallet-balance call sites only — do not touch reporting/analytics queries in this task.

## Verification

- Reopen the refund dialog for client `9e2fa8d9…` → **Available to refund** shows ≈ **$102.51**, rate auto-fills to **৳145.00** (from the latest approved payment).
- Reopen for a client with no payments but with a completed credit transaction → rate uses that transaction's `exchange_rate` instead of ৳120.
- Reopen for a brand-new client with nothing → still shows ৳120 with the existing hint.
- Refund submission math (USD × rate = BDT, agency BDT deduction, USD debit) unchanged.

## Technical notes

- Files touched: `src/components/RefundDialog.tsx` (primary). Possibly 1–2 sibling wallet-balance call sites if the grep in step 3 finds them.
- No migration, no edge function change, no RLS change.
- `fetchAllRows` already exists and is the standard fix for the 1000-row cap in this project.
