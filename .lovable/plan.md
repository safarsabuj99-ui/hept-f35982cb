

## Plan: Fully Automated USD Inventory Snapshots

### What Changes

Instead of manually clicking "Close Period", a scheduled backend function runs automatically on the 1st of every month at midnight (Asia/Dhaka timezone). It calculates the current USD balance and saves a snapshot — zero manual work needed.

### How It Works

1. **Scheduled Edge Function** (`auto-snapshot-usd`) runs monthly via pg_cron
2. It performs the same calculation the frontend does:
   - Fetches latest snapshot → gets carry-forward balance and since-date
   - Sums `usd_purchases.usd_received` after that date
   - Sums `daily_metrics.spend` after that date
   - Calculates `Available USD = carry + bought - spent`
   - Inserts a new snapshot row with that balance
3. **Frontend stays the same** — the overview cards automatically pick up the latest snapshot, so the "since" window resets each month without anyone touching anything

### Files to Create/Change

| File | Change |
|------|--------|
| `supabase/functions/auto-snapshot-usd/index.ts` | New edge function that calculates balance and inserts snapshot |
| `supabase/config.toml` | Add `verify_jwt = false` for the new function |
| Database (via insert tool) | Schedule pg_cron job to call the function monthly on the 1st |
| `src/pages/WalletInventory.tsx` | Add a small "Auto: Monthly" indicator near the snapshot date, and keep the manual "Close Period" as an override option |

### Edge Function Logic

```typescript
// 1. Get latest snapshot
const { data: snapshots } = await supabase
  .from("usd_inventory_snapshots")
  .select("*")
  .order("snapshot_date", { ascending: false })
  .limit(1);

const snapshot = snapshots?.[0];
const carryForward = snapshot ? Number(snapshot.balance_usd) : 0;
const sinceDate = snapshot?.snapshot_date ?? "2020-01-01";

// 2. Sum purchases and spend since snapshot
const { data: purchases } = await supabase
  .from("usd_purchases").select("usd_received").gt("date", sinceDate);
const { data: spend } = await supabase
  .from("daily_metrics").select("spend").gt("data_date", sinceDate);

const bought = purchases.reduce((s, r) => s + Number(r.usd_received), 0);
const spent = spend.reduce((s, r) => s + Number(r.spend), 0);
const balance = carryForward + bought - spent;

// 3. Insert new snapshot
await supabase.from("usd_inventory_snapshots").insert({
  snapshot_date: today,  // 1st of the month
  balance_usd: balance,
  notes: "Auto monthly close — " + monthLabel,
  created_by: "00000000-0000-0000-0000-000000000000", // system
});
```

### Cron Schedule

Runs on the 1st of every month at 00:05 (gives time for previous day's spend to sync):

```sql
SELECT cron.schedule(
  'auto-snapshot-usd-monthly',
  '5 0 1 * *',
  $$ SELECT net.http_post(...) $$
);
```

### What the Admin Still Controls
- **Set Opening Balance** — still available for first-time setup
- **Manual Close Period** — still works as an override anytime (e.g., mid-month reset)
- The auto-snapshot simply ensures it happens every month even if nobody remembers

### No New Tables Needed
Uses the existing `usd_inventory_snapshots` table. Only needs `pg_cron` and `pg_net` extensions enabled.

