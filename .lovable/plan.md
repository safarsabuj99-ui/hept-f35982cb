

## Plan: Fix USD Inventory Available Balance Mismatch

### What I found

The **Available USD** shown on `/admin/finance?tab=wallet` is `$140.00`, but you say your card actually has `$221.51`. After tracing the math through `auto-snapshot-usd`:

**Current snapshot (2026-04-17):**
```
baseline (-125.71)   ← set manually 04-15 at 18:35 Dhaka
+ purchases since 04-15 = +505.99   ← Bybit purchase from 04-15 at 12:07
- spend since 04-15 = -240.28       ← includes 04-15, 04-16, 04-17 daily metrics
- manual spend = 0
= $140.00
```

### Bug 1: Same-day-as-baseline double counting (confirmed)

The function filter is `>= baseline_date` (calendar day). When you set the baseline on **April 15 at 18:35**, that `-125.71` figure already reflected all purchases and spend that happened **earlier that same day**.

But the recompute then adds them again:
- `usd_purchases` row from 04-15 at 12:07 (`+505.99`) — already inside baseline → counted twice
- `daily_metrics` for `data_date = 04-15` (`-117.35`) — already inside baseline → subtracted twice

This makes the running balance drift further from reality every refresh, exactly the same class of bug we fixed before but on the **opposite edge** (start day vs. end day).

### Bug 2: No way to correct the card balance

Right now your card holds `$221.51`. The system insists it's `$140.00`. Because the baseline is immutable and same-day rows are double-counted, no amount of refresh will make these match. There's no UI to say "trust me, the real balance right now is X — reset baseline."

### The fix

#### 1. Stop double-counting same-day baseline activity (`auto-snapshot-usd/index.ts`)

Change the filter from "include baseline date" to "include only what happened after the baseline":

```ts
// purchases & manual spends — exclude baseline day entirely
const purchaseFilter = baselineDate
  ? (q) => q.gt("date", baselineDate)
  : undefined;
const manualFilter = baselineDate
  ? (q) => q.gt("date", baselineDate)
  : undefined;

// daily_metrics (spend) — same: only days strictly after baseline
const spendFilter = baselineDate
  ? (q) => q.gt("data_date", baselineDate)
  : undefined;
```

Effect on the current data after deploy:
```
-125.71 + 0 - (120.45 + 2.48) = -248.64
```

That number is honest given the recorded inputs, but it's still not `$221.51`. That gap is the symptom of Bug 2 — the baseline itself is stale/wrong relative to physical reality.

#### 2. Add a "Reset Available Balance" action in the wallet UI (`WalletInventory.tsx`)

A new small dialog ("Reset Available Balance") that lets you enter the **actual current USD on your card** and stores it as a fresh manual snapshot for **today** with:
- `baseline_balance_usd = <entered amount>`
- `balance_usd = <entered amount>`
- `notes = "Balance reset to match card — ৳..."`
- `created_by = <your user id>` (manual, so future auto-snapshots respect it)

After this, the auto-snapshot picks it up as the new immutable baseline and only counts purchases/spend **from tomorrow onward** — exactly what you want.

This replaces the awkward "Close Period" workflow when you just need to correct a drift.

#### 3. One-time data correction

Once the code is deployed, you click **Reset Available Balance → enter `221.51`**. From then on:
- Baseline locks at `$221.51` for today (04-17)
- Tomorrow's spend syncs subtract from it
- Future card top-ups (logged via `Record Purchase`) add to it
- Refreshes can't drift it anymore

### Files changed

| File | Change |
|------|--------|
| `supabase/functions/auto-snapshot-usd/index.ts` | Switch filters from `gte` to `gt` on baseline date; add comment explaining why |
| `src/pages/WalletInventory.tsx` | Add "Reset Available Balance" button + dialog that writes a manual baseline snapshot for today |

### Result

- The double-counting bug at the start edge of the period is gone (matches the prior fix at the end edge)
- You get a one-click way to realign the system to your actual card balance whenever they drift apart
- After your one-time reset to `$221.51`, the Available USD will tick down correctly as ads spend and up correctly as you record new purchases

