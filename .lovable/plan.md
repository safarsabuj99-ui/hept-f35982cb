

## Plan: Smart USD Inventory with Snapshot Ledger System

### The Problem
The current system sums **all-time** `usd_purchases` and `daily_metrics` rows every time you load the page. After 1-2 years, this becomes slow, hits query limits (1000 row cap), and you can never reset without losing accuracy.

### The Solution: Snapshot-Based Ledger
Like a bank statement — you don't re-add every transaction since day one. You carry forward a closing balance.

```text
Current Balance = Last Snapshot Balance
                + Purchases Since Snapshot
                - Spend Since Snapshot
```

### How It Works

1. **Opening Balance**: Admin sets an initial USD balance (e.g., "I currently have $500 in hand"). This creates the first snapshot.
2. **Live Tracking**: The system only queries purchases and spend **after** the last snapshot date — fast, accurate, no row limits.
3. **Close Period**: When you want to reset (monthly, quarterly, yearly), click "Close Period". This saves the current calculated balance as a new snapshot. All older data becomes irrelevant for the overview.
4. **History preserved**: Old `usd_purchases` records stay in the table for auditing. They just aren't needed for the live balance calculation anymore.

### Visual Layout

```text
┌─────────────────────────────────────────────────────────────┐
│  USD Inventory                              [Close Period]  │
├──────────┬──────────┬──────────┬──────────┬─────────────────┤
│ Available│ Carry-   │ Bought   │ Spent    │ Burn / Runway   │
│ USD      │ Forward  │ (Since)  │ (Since)  │                 │
│ $2,450   │ $1,200   │ $3,500   │ $2,250   │ $180/d · 13d    │
├──────────┴──────────┴──────────┴──────────┴─────────────────┤
│ Client Obligations: $1,800   │   USD Needed: $0  ✓          │
│ Snapshot: Mar 1, 2026        │                              │
└──────────────────────────────────────────────────────────────┘
```

### Database Change

**New table: `usd_inventory_snapshots`**

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | PK |
| snapshot_date | date | The cutoff date |
| balance_usd | numeric | Calculated balance at that date |
| notes | text | Optional (e.g., "Q1 close") |
| created_by | uuid | Admin who created it |
| created_at | timestamptz | Auto |

RLS: Admin-only full access.

### Frontend Changes

**File: `src/pages/WalletInventory.tsx`**

1. **Replace `fetchOverview`** — instead of querying all-time, fetch the latest snapshot, then only query `usd_purchases` and `daily_metrics` rows **after** `snapshot_date`.
2. **Add "Set Opening Balance" button** — shown when no snapshot exists yet. Admin enters their current USD in hand.
3. **Add "Close Period" button** — calculates current balance and saves it as a new snapshot. Resets the calculation window.
4. **Update KPI cards** — show "Carry Forward" (snapshot balance), "Bought Since" and "Spent Since" instead of confusing all-time totals.
5. **Show snapshot date** — small label indicating when the last period was closed.

### Calculation Logic (New)

```typescript
// 1. Get latest snapshot
const snapshot = await supabase.from("usd_inventory_snapshots")
  .select("*").order("snapshot_date", { ascending: false }).limit(1);

const carryForward = snapshot?.balance_usd ?? 0;
const sinceDate = snapshot?.snapshot_date ?? "2020-01-01";

// 2. Only query data AFTER snapshot
const purchases = await supabase.from("usd_purchases")
  .select("usd_received").gt("date", sinceDate);
const spend = await supabase.from("daily_metrics")
  .select("spend").gt("data_date", sinceDate);

// 3. Calculate
const boughtSince = sum(purchases);
const spentSince = sum(spend);
const availableUSD = carryForward + boughtSince - spentSince;
```

### Files to Change

| File | Change |
|------|--------|
| **Database** | Create `usd_inventory_snapshots` table with admin RLS |
| `src/pages/WalletInventory.tsx` | Replace all-time queries with snapshot-based calculation; add Opening Balance + Close Period UI |

### Why This Is Better
- Queries only recent data — fast at any scale
- No 1000-row limit issues
- Admin can reset anytime without losing accuracy
- Opening balance lets you start tracking without importing history
- Snapshot history serves as an audit trail

