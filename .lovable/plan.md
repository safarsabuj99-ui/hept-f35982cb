

# Add Balance Column to Client List

## What
Add an "Available Balance" column after the Margin column in the Client List table, showing each client's current USD balance.

## How

### `src/pages/ClientList.tsx`
1. **Fetch transactions** in the existing `load()` function — add a query for `transactions` table selecting `client_id, type, amount` where `status = 'completed'`
2. **Compute balances** — aggregate `credits - debits` per client into a `balances` state map (`Record<string, number>`)
3. **Add column** — insert a `Balance` table header after `Margin`, and a corresponding cell showing the formatted USD amount with a color-coded badge (green for positive, red for negative/zero)
4. **Interface update** — add `balances` state variable

### Column Display
- Format: `$xxx.xx` in a mono font badge
- Green badge for positive balance, red/destructive for negative or zero

Single file change: `src/pages/ClientList.tsx`

