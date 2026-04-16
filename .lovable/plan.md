
The user wants to open a new USD inventory period at $220, accounting for the fact that $2.48 has already been spent today. So the baseline should be set such that current available = $220 with $2.48 spent since baseline → baseline = $222.48. OR set baseline = $220 and consider spend already covered.

Let me re-read: "220 USD is available after spend 2.48 USD. Lets reopen new USD inventory"

So they want: after today's $2.48 spend has been deducted, $220 should remain available. The cleanest way: set the baseline = $222.48 dated today, so when the auto-snapshot deducts the $2.48 spend that already happened today, the displayed Available USD = $220.

Actually simpler: set the baseline_balance_usd = 222.48 for today (2026-04-17), and the auto-snapshot computes balance = 222.48 - 2.48 (today's spend) = 220.

Plan is short and clear.

## Plan: Open New USD Period at $220 (After $2.48 Spend)

### Goal
Open a fresh USD inventory period today (2026-04-17) so that **Available USD = $220** after today's $2.48 ad spend is accounted for.

### Approach
Since the auto-snapshot function calculates:
`balance = baseline + purchases_since_baseline − spend_since_baseline − manual_spend_since_baseline`

To land at $220 with $2.48 already spent today, the baseline must be set to **$222.48**.

### Steps

1. **Upsert today's snapshot row** (`2026-04-17`) in `usd_inventory_snapshots`:
   - `baseline_balance_usd = 222.48` (immutable carry-forward anchor)
   - `balance_usd = 220` (current available after today's spend)
   - `created_by = your admin user_id` (marks as a manual baseline)
   - `notes = "Period reopen — $220 available after $2.48 spend"`
   - `metrics = { carry_forward: 222.48, bought_since: 0, spent_since: 2.48, manual_spend: 0 }`

2. **Trigger `auto-snapshot-usd`** to recompute derived metrics (burn rate, runway, client obligations) against the new $222.48 baseline. The function will read today's $2.48 spend and confirm the displayed balance = $220.

3. **Verify** the Wallet Inventory page shows **Available USD = $220**.

### Why $222.48 baseline (not $220)
The auto-snapshot subtracts every spend dated ≥ baseline_date. Today's $2.48 has `data_date = 2026-04-17`, so it counts against the baseline. Setting baseline = $222.48 produces the correct $220 display.

### Result
- Old period (ending 2026-04-16) sealed; history preserved.
- New period anchored at $222.48 dated today.
- Wallet shows **$220 Available USD**, with the $2.48 spend correctly attributed to the new period.
- All future purchases/spend/manual entries from today onward accumulate cleanly on this baseline.
