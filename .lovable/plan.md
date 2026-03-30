

## Plan: Show TrxID in Mobile/Tablet Views + Client Side

### Changes

**1. Admin Payment Requests — Mobile cards** (`src/pages/PaymentRequests.tsx`, lines 305-357)
- Add TrxID to the mobile card view between the metrics grid and the footer
- Show as a small row: `TrxID: ABC123` in `text-[11px] font-mono text-muted-foreground`, only if `transaction_id` exists

**2. Admin Payment Requests — Desktop table** (`src/pages/PaymentRequests.tsx`, line 386)
- The TrxID column already exists but is hidden on medium screens (`hidden md:table-cell`). Remove the `hidden md:` prefix so it shows on tablet too.

**3. Client Wallet — Payment Requests mobile cards** (`src/pages/ClientWallet.tsx`, lines 264-283)
- Add TrxID display below the date line: `TrxID: ABC123` in `text-[10px] font-mono`, only if `pr.transaction_id` exists

**4. Client Wallet — Payment Requests desktop table** (`src/pages/ClientWallet.tsx`, lines 286-315)
- Add a new `TrxID` column to the table header and body showing `pr.transaction_id || "—"`

### Files Changed
1. `src/pages/PaymentRequests.tsx` — add TrxID to mobile cards, unhide on tablet
2. `src/pages/ClientWallet.tsx` — add TrxID to both mobile cards and desktop table

