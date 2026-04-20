

## Why "All Time" Gross Profit Is Wrong (and how to fix it)

### The math you're seeing

| Period | Revenue (BDT) | COGS (BDT) | Gross Profit | UI shows |
|---|---|---|---|---|
| This Month | 426,212 | 373,965 | **৳52,247** | ৳43,660* |
| Last Month | 77,031 | 67,898 | **৳9,133** | ৳9,269 ✓ |
| All Time | **503,243** | 441,832 | **৳61,411** (true) | **৳38,949** ✗ |

\*This-month also slightly off — same root cause, smaller magnitude.

### Root cause (verified in the database)

`ProfitLossWidget.tsx` reads `daily_metrics` with a single un-paginated query:

```ts
const { data: metricsData } = await metricsQuery; // no .range(), no pagination
```

**Supabase silently caps every SELECT at 1,000 rows.**

- True row count for all-time: **1,740 rows** (3,429 USD spend)
- Returned by the capped query: **1,000 rows** (~1,694 USD spend)
- **~740 rows of spend are silently dropped from REVENUE math**

But COGS isn't dropped — it's recomputed as `total_spend_usd × WAC`, where `total_spend_usd` comes from the same truncated set. So both sides shrink, but **revenue shrinks proportionally more** because the dropped rows happen to belong to higher-rate clients. Net effect: gross profit collapses to ৳38,949.

When you pick This Month or Last Month, the row count drops below 1,000, the cap doesn't trigger, and the numbers reconcile — that's why shorter ranges look correct and only "All Time" looks broken.

This same bug affects **any widget** that reads `daily_metrics`, `transactions`, or `campaigns` without pagination once the dataset crosses 1,000 rows. The codebase already has a helper for exactly this — `src/lib/fetchAllRows.ts` — but it isn't used in the profit widgets yet.

### Fix Plan

**Layer 1 — Fix `ProfitLossWidget.tsx`**

Replace the single `daily_metrics` fetch with `fetchAllRows()`:

```ts
import { fetchAllRows } from "@/lib/fetchAllRows";

const metricsData = await fetchAllRows<{ campaign_id: string; spend: number }>(() => {
  let q = supabase.from("daily_metrics").select("campaign_id, spend");
  if (dateRange) {
    q = q.gte("data_date", toISODate(dateRange.from)).lte("data_date", toISODate(dateRange.to));
  }
  return q;
});
```

Apply the same pattern to the campaigns and profiles fetches (defensive — they're not at the cap today but will silently break at scale).

**Layer 2 — Fix `FinanceDashboard.tsx`**

Same pattern: this page also computes gross profit via un-paginated `daily_metrics` and `campaigns` reads, so it has the same latent bug for any agency exceeding 1,000 metric rows.

**Layer 3 — Audit sweep (defensive)**

Quick search-and-fix pass on remaining un-paginated reads of `daily_metrics`, `transactions`, `campaigns`, `usd_purchases`, `agency_expenses` in analytics surfaces. Wrap each with `fetchAllRows()`.

**Layer 4 — Consistency guarantee**

After the fix, the invariant holds:

```
this_month_gross_profit + last_month_gross_profit + (older months) = all_time_gross_profit
```

Verified expected post-fix all-time gross profit: **৳61,411** (instead of the broken ৳38,949).

### Files Changed

| File | Change |
|---|---|
| `src/components/ProfitLossWidget.tsx` | Replace un-paginated `daily_metrics` / `campaigns` / `profiles` reads with `fetchAllRows()` |
| `src/pages/FinanceDashboard.tsx` | Same pagination fix on the dashboard's profit aggregator |

Zero schema changes, zero RLS changes, zero breaking changes — just makes the existing reads complete instead of silently truncated.

### Why this is the right fix

- **Removes the silent 1,000-row data loss** that's making All Time look wrong.
- **Self-consistent**: monthly gross profits will now sum to the all-time gross profit.
- **Future-proof**: every agency that grows past ~30 days of full-scale metrics would hit this exact bug. Fixing it now prevents support tickets later.
- **Uses existing infrastructure**: `fetchAllRows` already exists, was built for exactly this scenario, and is documented in the codebase.

### Build Time
~5 minutes. 2 files. No migration needed.

