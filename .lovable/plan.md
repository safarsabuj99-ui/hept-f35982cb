

# Fix Profit Calculation — Use Real Gap-Based Method

## Your Profit Model (Correct)
```text
Cost Rate (WAC) = Total BDT Paid / Total USD Bought (e.g., 128 BDT/USD)
Billing Rates   = Meta: 145, TikTok: 150, Google: 150 BDT/USD
Gap per platform = Billing Rate - WAC

Profit = Σ (spend_usd × gap_bdt) per platform
       = Σ (spend_usd × (billing_rate - WAC))

Example: 100 USD Meta → 100 × (145 - 128) = 1,700 BDT profit
```

## What's Currently Wrong

| Component | Issue |
|-----------|-------|
| **ProfitLossWidget** | Compares `raw_spend_amount` vs `final_billable_usd` from `daily_ad_spend` — ignores WAC and platform rates entirely |
| **ProfitabilityTable** | Same wrong method, aggregated per client |
| **ClientList margin indicator** | Same wrong method from `daily_ad_spend` |
| **FinanceDashboard** (line 123) | Almost correct but has a bug: only checks `platform_rates` key, misses `flat_rates` fallback |

## Fix Plan

### 1. `src/components/ProfitLossWidget.tsx` — Rewrite calculation
- Fetch `usd_purchases` → compute WAC (`total_bdt / total_usd`)
- Fetch `daily_metrics` joined through `campaigns` → get spend per platform
- Fetch client `profiles` → get `flat_rates` / `platform_rates` per platform
- Calculate: `revenue = spend × platform_rate`, `cogs = spend × WAC`, `margin = revenue - cogs`
- Display totals in BDT (Revenue, Cost, Margin) with the gap percentage

### 2. `src/components/dashboard/ProfitabilityTable.tsx` — Same rewrite per client
- Same data sources as above, aggregated per client
- Show columns: Client, Spend (USD), Revenue (BDT), Cost (BDT), Gap/Margin (BDT), Margin %
- Margin % = `((billing_rate - WAC) / WAC) × 100` effectively

### 3. `src/pages/ClientList.tsx` — Fix margin indicator
- Replace the `daily_ad_spend` based calculation with `daily_metrics` + `campaigns` + WAC approach
- Same gap logic per platform

### 4. `src/pages/FinanceDashboard.tsx` — Fix pricing key bug (line 123)
- Change `pricingConfig?.platform_rates` to `pricingConfig?.flat_rates || pricingConfig?.platform_rates`
- Ensures clients created via ClientDetail (which saves as `flat_rates`) are read correctly

### Data Flow (All Components)
```text
usd_purchases → WAC (128 BDT/USD)
                          ↓
daily_metrics → spend_usd per campaign
campaigns     → maps campaign to ad_account + platform
ad_account_clients → maps ad_account to client
profiles      → flat_rates per platform (145, 150, 150)
                          ↓
Gap = flat_rate[platform] - WAC
Profit(BDT) = spend_usd × gap
```

### Files Changed
| File | Change |
|------|--------|
| `src/components/ProfitLossWidget.tsx` | Rewrite to use WAC + platform rates |
| `src/components/dashboard/ProfitabilityTable.tsx` | Rewrite per-client with WAC + platform rates |
| `src/pages/ClientList.tsx` | Fix margin indicator calculation |
| `src/pages/FinanceDashboard.tsx` | Fix `flat_rates` fallback on line 123 |

