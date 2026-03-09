

# Plan: Show Balance in BDT When Negative on Client List

## What Changes

The Balance column in the Client List currently always shows USD. The new behavior:
- **Positive balance** → show USD as-is (e.g., `$500.00`)
- **Negative balance** → show BDT equivalent (e.g., `-৳72,000.00`), calculated using per-platform rates from the client's `pricing_config.flat_rates`

## How It Works

To convert a negative total balance to BDT accurately, we need per-platform negative balances (same approach as client dashboard). Each platform's negative portion gets multiplied by its respective flat rate.

## Changes to `src/pages/ClientList.tsx`

### 1. Update transactions query (line 60)
Add `platform` to the transaction select:
```ts
supabase.from("transactions").select("client_id, type, amount, platform").eq("status", "completed")
```

### 2. Compute per-platform balances alongside total balance (lines 122-128)
In addition to the total `balMap`, build a `platformBalMap: Record<string, Record<string, number>>` that tracks per-platform balance for each client.

### 3. Add BDT negative balance calculation
New state or computed value: `bdtBalances: Record<string, number>`. For each client with a negative total balance, sum each negative platform sub-balance multiplied by the client's `pricing_config.flat_rates[platform]` (fallback 120).

### 4. Update Balance cell rendering (lines 254-267)
- If `bal >= 0`: show `$bal` in green (current behavior)
- If `bal < 0`: show `-৳bdtAmount` in red, using the computed weighted BDT amount

