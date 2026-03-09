

# Plan: Add Optional Platform Charge % to USD Purchase Dialog

## Problem
When buying USD from certain platforms, they charge a fee (e.g., 1-2%). Currently the dialog records the raw USD received without accounting for this charge. The user wants to optionally enter a charge %, which deducts from USD received and recalculates the effective cost per dollar.

## How It Works
- Add an optional "Platform Charge %" input field in the Record USD Purchase dialog
- When a % is entered, the effective USD = `usdReceived - (usdReceived * charge% / 100)`
- The Calculated Rate preview updates to show the rate **after** charge deduction
- The `usd_received` saved to the database will be the **net** amount (after charge deduction)
- This way, WAC and all profit calculations automatically reflect the true cost

## Changes

### `src/pages/WalletInventory.tsx`

1. **Add state**: `chargePercent` (string, default `""`)
2. **Add computed values**:
   - `effectiveUsd = chargePercent ? usdReceived * (1 - chargePercent/100) : usdReceived`
   - Update `previewRate` to use `effectiveUsd` instead of raw `usdReceived`
3. **Add UI** (between USD Received and Calculated Rate):
   - Optional "Platform Charge %" input (number, step 0.1, placeholder "e.g. 1.5")
   - When filled, show a helper text: "Net USD: X.XX after Y% charge"
4. **Update `handleSubmit`**: Save `effectiveUsd` as `usd_received` in the database insert
5. **Reset** `chargePercent` on dialog close

## Result
The calculated rate and saved USD amount will reflect the true cost after platform fees, flowing correctly into all WAC/profit calculations across the system.

