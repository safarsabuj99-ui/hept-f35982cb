

# Plan: Show Negative Balance in BDT on Client Dashboard

When a platform balance (Meta, TikTok, Google) or total balance is negative, show the equivalent BDT amount using the client's platform-specific flat rates from `pricing_config.flat_rates`.

## How It Works

- Client's `profiles.pricing_config` contains `flat_rates: { meta: 128, tiktok: 125, google: 130 }` (USD→BDT rates per platform)
- If Meta balance is -$10 and Meta rate is 128, show **-৳1,280.00** below the USD amount
- For total balance: calculate weighted BDT by converting each negative platform balance using its respective rate, then sum

## Changes to `src/pages/ClientDashboard.tsx`

1. **Fetch `pricing_config`** alongside `full_name` in the profile query (line 135). Store in state.

2. **Platform sub-balance cards** (lines 348-358): When `pb.balance < 0`, show a second line below the USD amount displaying the BDT equivalent:
   - `bdtAmount = Math.abs(pb.balance) * (pricingConfig?.flat_rates?.[pb.platform] || 120)`
   - Render: `৳{bdtAmount.toLocaleString(...)}`

3. **Main balance card** (line 343): When `balance < 0`, compute total negative BDT by summing each negative platform balance × its rate, then display below the USD figure.

4. Only show the BDT line when balance is negative — positive balances stay USD-only as they are now.

