

## Plan: Add Per-Client Obligation Balance Breakdown to USD Inventory

### What It Does

Adds a client-by-client obligation balance table to the USD Inventory wallet page, showing each client's positive USD balance (money you owe them in ad spend). Currently only a single aggregate number is shown.

### Data Source

The `auto-snapshot-usd` edge function already computes per-client balances from the `transactions` table. We'll enhance it to include the per-client breakdown in the `metrics` JSONB, and display it in the UI.

### Actions

**1. Update `auto-snapshot-usd` edge function**
- Add a `client_balances` array to the `metrics` object containing `{ client_id, full_name, balance }` for each client with a positive balance (obligation)
- Join against `profiles` to get client names

**2. Update `WalletInventory.tsx` UI**
- Replace the single-line "Client Obligations" text with an expandable section or small table
- Show each client's name and their USD obligation balance
- Keep the total and "USD Needed" summary
- Add a collapsible/accordion so it doesn't clutter the overview when collapsed

### Files Changed

| File | Change |
|------|--------|
| `supabase/functions/auto-snapshot-usd/index.ts` | Add per-client balance breakdown to metrics JSONB |
| `src/pages/WalletInventory.tsx` | Display client obligation table with names and balances |

