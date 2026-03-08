

# Show Client Due Balance in BDT in the Client Overview Table

## What You Want
When a client has a negative USD balance (they owe money), show how much they owe in BDT in the "Balance (BDT)" column. The conversion uses each platform's billing rate from the client's pricing config (e.g., Meta debits × 145, TikTok debits × 150, Google debits × 150). If the client's balance is positive, show "—" in the BDT column.

## How It Works
The same logic already used for the Payment Due KPI will be applied per-client:
1. For each client with negative USD balance, group their debit transactions by platform
2. Multiply each platform's USD debits by the client's `flat_rates` for that platform
3. Subtract the client's total BDT credits (from approved payment requests `amount_bdt`)
4. Display the result as `৳XX,XXX` in the BDT column

## Files to Change

### 1. `src/pages/AdminDashboard.tsx`
- In the `result` mapping (line ~133-138), calculate `dueBdt` per client using the same platform-rate logic already used for the KPI (lines 140-162)
- Add `dueBdt` to the `ClientWithBalance` interface
- Pass it through to `ClientOverviewTable`

### 2. `src/components/dashboard/ClientOverviewTable.tsx`
- Add `dueBdt` to the `Client` interface
- Replace the placeholder `fmtBdt` function with actual formatting: if `dueBdt > 0`, show `৳{dueBdt.toLocaleString()}`, otherwise show "—"
- Display in the existing "Balance (BDT)" column

## Example Display

| Name | Balance (USD) | Balance (BDT) |
|------|--------------|---------------|
| Client A | -$200.00 | ৳29,000 |
| Client B | $500.00 | — |

