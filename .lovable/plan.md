
# Per-Client Per-Platform Exchange Rates + Dual Profit System

## What You Want

Two profit models that can coexist per client:

1. **BDT Billing (Flat Rate per Platform)**: Client pays you in BDT. You charge per-platform USD-to-BDT rates (e.g. Meta=145, TikTok=150, Google=155). Your profit = difference between what you charge and your actual dollar buying cost.

2. **USD Billing (Percentage Markup)**: Client pays you in USD. You charge a percentage on top of spend (e.g. 10%). Your profit = the markup amount.

Every client MUST have per-platform rates set (for BDT billing). Optionally, they can ALSO have a percentage markup (for USD billing). These are not mutually exclusive modes.

Additionally, the BDT-to-USD conversion for BDT ad accounts is handled at the ad account level, not per client.

## Changes

### 1. Remove Global Exchange Rate from Settings
- Delete the "Exchange Rate" card from Settings page
- Keep only "Service Margin" and "Sync Start Date"

### 2. NewClient Page -- Always Show Platform Rates
- Remove the "Pricing Model" dropdown (no more mode switching)
- Remove the "Custom Exchange Rate" field
- Always show three platform rate inputs: Meta (default 145), TikTok (default 150), Google (default 155)
- Add optional "Percentage Markup" field below for USD-billing clients
- Save as: `{ platform_rates: { meta: 145, tiktok: 150, google: 155 }, percentage: 10 }`
- Only show these fields when role is "client"

### 3. ClientDetail Pricing Tab -- Simplified
- Remove the "Pricing Mode" dropdown
- Remove "Custom Exchange Rate" field
- Always show the three platform rate inputs
- Always show percentage markup field (0 = no markup)
- Load from `pricing_config.platform_rates` and `pricing_config.percentage`

### 4. create-client Edge Function
- Normalize incoming data to `{ platform_rates: { meta, tiktok, google }, percentage }` format
- Remove `custom_exchange_rate` handling (no longer sent)

### 5. PaymentRequests -- Fix Rate Options
- Currently reads `pricingConfig.rates.meta` (old key) -- broken
- Fix to read `platform_rates.meta`, `platform_rates.tiktok`, `platform_rates.google`
- Remove "Custom Rate" and "Default Rate" fallbacks
- Show only the three platform rates as conversion options when approving BDT payments

### 6. FinanceDashboard -- Fix Revenue Calculation
- Currently reads old keys (`mode: "flat_rate"`, `rates`, `markup`) -- broken
- Fix: For each client, get per-platform spend from `daily_metrics` + `campaigns` (replacing legacy `daily_ad_spend`)
- Revenue = sum of (platform_spend_usd x client's platform_rate) for each platform
- For percentage clients: additional revenue = spend x (percentage / 100)
- Use `ad_account_clients` junction table instead of `ad_accounts.client_id` (which is null)

### 7. useCurrency Hook
- Remove global exchange rate fetch from settings table
- Simplify to a basic USD/BDT display formatter

### 8. approve-payment Edge Function
- Update fallback rate logic to read `platform_rates` from `pricing_config`
- Keep `selected_rate` override (admin picks which platform rate during approval)

### 9. ClientList Pricing Label
- Update `getPricingLabel` to show platform rates summary instead of mode name

## New Standard Schema

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

## Technical Details

### Files Modified

| File | Change |
|------|--------|
| `src/pages/Settings.tsx` | Remove Exchange Rate card |
| `src/pages/NewClient.tsx` | Remove mode dropdown and custom rate; always show 3 platform rates + optional percentage |
| `src/pages/ClientDetail.tsx` | Simplify Pricing tab to platform rates + percentage |
| `src/pages/ClientList.tsx` | Update pricing label display |
| `src/pages/PaymentRequests.tsx` | Fix rate options to read `platform_rates` |
| `src/pages/FinanceDashboard.tsx` | Fix P&L to use `platform_rates` + per-platform spend from `daily_metrics`/`campaigns` |
| `src/hooks/useCurrency.tsx` | Remove global rate fetch |
| `supabase/functions/create-client/index.ts` | Save `platform_rates` + `percentage` format |
| `supabase/functions/approve-payment/index.ts` | Read `platform_rates` for conversion |

### No Database Migration Needed
- `pricing_config` is already JSONB -- just changing the JSON structure stored
- `custom_exchange_rate` column stays in schema but will no longer be actively used
