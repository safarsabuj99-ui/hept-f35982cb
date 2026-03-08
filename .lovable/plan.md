

# Convert "Payment Due" KPI from USD to BDT

## What Changes
Only the **Payment Due** KPI card on the Admin Dashboard will show BDT instead of USD. Client balances, Total Balance, and everything else stays in USD as-is.

## How It Works
Currently, `totalDue` sums negative USD balances. To convert to BDT, we need to calculate each client's due amount per-platform using their `pricing_config.flat_rates`.

For clients with negative balance (meaning they owe money), their debits come from `transactions` table which has a `platform` field. We multiply each platform's debit USD amount by the client's rate for that platform (e.g., Meta × 145, TikTok × 150), then subtract BDT credits (from approved `payment_requests.amount_bdt`). If the result is negative (client owes), that's their BDT due.

## File: `src/pages/AdminDashboard.tsx`

1. **Fetch `pricing_config`** alongside profiles (line 81) — add `pricing_config` to the select
2. **Calculate `totalDueBdt`** after building the clients array:
   - For each client with negative USD balance, group their completed debit transactions by platform
   - Multiply each platform's debit total by the client's `flat_rates[platform]` (fallback to 120)
   - Sum approved `payment_requests.amount_bdt` for that client as BDT credits
   - `dueBdt = debitsBdt - creditsBdt` — if positive, client owes this much in BDT
   - Sum all positive `dueBdt` values = `totalDueBdt`
3. **Update the KPI card** (line 249-256): Change from `$${totalDue}` / `USD` to `৳${totalDueBdt}` / `BDT`

No changes to client balance display, client table, or any other widget.

| File | Change |
|------|--------|
| `src/pages/AdminDashboard.tsx` | Add `pricing_config` to profiles fetch, compute `totalDueBdt`, update Payment Due KPI to show ৳ |

