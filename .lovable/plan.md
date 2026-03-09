

# Plan: Payment Due Widget — Platform-Weighted BDT from Negative Balances

## Current Behavior
Line 230: `totalDue` = sum of `Math.abs(balance)` for all clients with `balance < 0`. Shows only USD.

## New Behavior
Calculate negative balances **per-platform per-client**, convert each to BDT using that client's `pricing_config.flat_rates` (Meta/TikTok/Google rates), then sum. Show both USD total and BDT total in the Payment Due KPI card.

## Changes to `src/pages/AdminDashboard.tsx`

### 1. Fetch `pricing_config` in profiles query
Update line 105 to include `pricing_config`:
```ts
supabase.from("profiles").select("user_id, full_name, email, business_name, pricing_config")
```

### 2. Calculate per-platform negative balances per client
After building client balances (around line 158), for each client with negative balance:
- Group their completed debit transactions by platform
- Group their completed credit transactions
- Calculate per-platform balance (credits minus debits per platform)
- For each negative platform balance, multiply by that client's `pricing_config.flat_rates.[platform]` (fallback 120)
- Sum all BDT amounts across all clients

### 3. Update Payment Due KPI (lines 277-284)
- Keep USD value: `$totalDue`
- Change subtitle to show BDT: `৳totalDueBdt`
- Both values only count negative balances

### Files Modified
- `src/pages/AdminDashboard.tsx`

