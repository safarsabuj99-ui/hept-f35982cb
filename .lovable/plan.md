

## Problem

The **Profit/Loss (BDT) widget** on the Admin Dashboard uses **different calculation logic** than the P&L Overview page, producing mismatched numbers (৳4,793 vs ৳1,044).

### Root Cause — Two Key Differences

1. **Client-to-campaign mapping**: The widget uses the `ad_account_clients` junction table to find clients, while the P&L Overview uses `campaigns.client_id` directly (the authoritative source per your wallet system architecture).

2. **Missing percentage markup**: The widget ignores `percentage_markup` in `pricing_config`, while the P&L Overview includes it in revenue calculations.

## Plan

### Single change: Rewrite `ProfitLossWidget` to use the same calculation logic as `FinanceDashboard`

**File**: `src/components/ProfitLossWidget.tsx`

Replace the current data-fetching logic with the FinanceDashboard approach:

- Use `campaigns.client_id` directly instead of the `ad_account_clients` junction table
- Include `percentage_markup` in revenue calculation
- Apply the same date-range filtering on `daily_metrics` using `toISODate()` helper
- Keep the same cascading WAC fallback (date range → current month → all-time)
- Keep the existing card UI unchanged

This ensures both views query the same data path and produce identical numbers.

### Technical Details

The widget currently:
```
ad_account_clients → campaigns (by ad_account_id) → daily_metrics
```

Will be changed to match P&L Overview:
```
campaigns (with client_id) → daily_metrics
```

Revenue calculation will add:
```typescript
if (percentageMarkup > 0) {
  revenueBdt += totalSpendUsd * (percentageMarkup / 100) * (platformRates.meta || 120);
}
```

No new files, no database changes. Single file edit.

