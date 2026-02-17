
# Per-Client Per-Platform Exchange Rates + Dual Profit System — IMPLEMENTED

## Standard Schema

```text
pricing_config = {
  "platform_rates": {
    "meta": 145,
    "tiktok": 150,
    "google": 155
  },
  "percentage": 10    // optional, 0 or absent means no percentage markup
}
```

## What Was Done

1. **Settings**: Removed global exchange rate card, kept Service Margin + Sync Start Date
2. **NewClient**: Always shows 3 platform rate inputs + optional percentage markup for clients
3. **ClientDetail Pricing Tab**: Simplified to platform rates + percentage (no mode selector)
4. **ClientList**: Updated pricing label to show platform rates summary
5. **PaymentRequests**: Fixed to read `platform_rates` from `pricing_config`
6. **FinanceDashboard**: Fixed P&L to use `daily_metrics` + `campaigns` with per-platform revenue calc via `ad_account_clients` junction table
7. **useCurrency**: Removed global rate fetch, simplified to basic formatter
8. **create-client Edge Function**: Normalizes to `{ platform_rates, percentage }` format
9. **approve-payment Edge Function**: Reads `platform_rates` for fallback conversion
10. **AdminDashboard + AddFunds + ClientOverviewTable**: Removed global exchangeRate dependencies
