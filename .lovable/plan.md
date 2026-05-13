# Show Last USD Inventory Close Data on Wallet Page

## Problem
The USD Inventory overview card only shows the current snapshot date (`Since {date}` badge). When an admin closes a period, there is no visibility into:
- When the previous period was closed
- What balance was carried forward from that close
- The historical chain of period closes

## Solution
Extend `fetchOverview` to load the last 2 manual snapshots, then display the previous close date & carried-forward balance alongside the current period start.

### Changes

1. **Data layer — `fetchOverview` in `WalletInventory.tsx`**
   - Query the last 2 manual snapshots (`created_by != system uuid`) instead of just 1.
   - `snapshot[0]` = current period baseline (already used today)
   - `snapshot[1]` = previous close (new data to expose)
   - Add to `UsdOverview` interface:
     - `previousCloseDate: string | null`
     - `previousCloseBalance: number`
     - `periodStartDate: string | null` (rename concept from snapshotDate)

2. **UI layer — Overview Card badges & summary line**
   - Replace the single "Since {date}" badge with:
     - **Current Period:** "Since {periodStartDate}" (green outline badge)
     - **Last Close:** "Closed {previousCloseDate} → ${balance}" (secondary badge)
   - If no previous close exists (first period), hide the Last Close badge.
   - Keep the "Auto: 5 min" badge unchanged.

3. **No database migrations required**
   - `usd_inventory_snapshots` already stores all necessary data.
   - `created_by` already distinguishes manual vs. auto snapshots.
   - Only frontend query logic changes.

### Acceptance Criteria
- [ ] After closing a period, the overview card shows both the new period start date and the previous close date with its carried-forward balance.
- [ ] First-time users (only 1 manual snapshot) see only the period-start badge, no last-close badge.
- [ ] Auto snapshots do not appear as "closes" — only manual snapshots count.
