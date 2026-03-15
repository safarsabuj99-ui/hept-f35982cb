

## Plan: USD Balance Tracker with Demand Forecasting

### What You're Getting

A new **USD Balance** section at the top of the Wallet & USD tab that shows:

1. **Available USD Balance** — Total USD purchased (all-time) minus total USD spent across all ad accounts (all-time). This is your real dollar inventory.
2. **Total USD Spent** — Sum of all `daily_metrics.spend` for mapped campaigns (all-time).
3. **Total USD Purchased** — Sum of all `usd_purchases.usd_received` (all-time).
4. **Daily Burn Rate** — Average USD spent per day over the last 7 days.
5. **Runway** — How many days your current USD balance will last at the current burn rate.
6. **USD Needed** — If client platform wallet balances (sum of credits - debits) exceed your available USD, this shows the shortfall. Tells you exactly how much more USD to buy.

### Visual Layout

```text
┌──────────────────────────────────────────────────────────────────┐
│  USD Inventory Overview (always all-time, independent of filter) │
├────────────┬────────────┬────────────┬────────────┬──────────────┤
│ Available  │ Total      │ Total      │ Daily Burn │ Runway /     │
│ USD Balance│ Purchased  │ Spent      │ Rate       │ USD Needed   │
│ $2,450     │ $15,000    │ $12,550    │ $180/day   │ 13 days      │
│            │            │            │            │ Need: $500   │
└────────────┴────────────┴────────────┴────────────┴──────────────┘
```

- Green highlight when balance is healthy (>7 days runway)
- Yellow when 3-7 days runway
- Red when <3 days or negative balance
- The "USD Needed" card shows a shortfall alert if client obligations exceed available USD

### How It Works

**Data sources (all queried all-time, not affected by the date filter):**
- `usd_purchases` → SUM of `usd_received` = total purchased
- `daily_metrics` → SUM of `spend` (only for campaigns linked to mapped ad accounts) = total spent
- `transactions` → SUM of credits - debits per client where status = completed = client obligations
- Last 7 days of `daily_metrics.spend` → daily burn rate

**Calculations:**
- `Available USD = Total Purchased - Total Spent`
- `Daily Burn = Last 7 days spend / 7`
- `Runway = Available USD / Daily Burn`
- `Client Obligations = SUM(client credit transactions) - SUM(client debit transactions)` (positive balances only)
- `USD Needed = Client Obligations - Available USD` (only if positive)

### Files to Change

| File | Change |
|------|--------|
| `src/pages/WalletInventory.tsx` | Add USD Balance overview cards section above the existing date-filtered KPIs. Fetch all-time totals for purchased, spent, client obligations, and 7-day burn rate independently from the date filter. |

### No Database Changes Required
All data already exists in `usd_purchases`, `daily_metrics`, and `transactions` tables. This is purely a frontend aggregation feature.

