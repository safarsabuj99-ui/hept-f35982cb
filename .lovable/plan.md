

## Fix Client Obligations — Multi-Tenant Snapshot Bug

### Root Cause (Confirmed via DB)

The `auto-snapshot-usd` edge function has **three multi-tenant defects**:

1. **No org filter on transactions** — sums `client balances` across ALL organizations into one obligations number
2. **One snapshot row per day globally** — `(snapshot_date)` is unique, so only ONE org's snapshot exists per day; whichever org runs the function last "wins"
3. **`LIMIT 1` org picker** — service-role context arbitrarily picks the first org row, mis-tagging snapshots

### Verified Symptoms
- Real org (`a1b2c3d4…`): true obligations = **$295.08 / 16 clients** (computed live from transactions)
- Today's snapshot was overwritten with **Test1 org's** numbers
- The widget on `/admin/finance?tab=wallet` shows **$393.61 / 17 clients** — yesterday's stale snapshot for the real org
- Refresh re-runs the function → which writes the OTHER org's data → number never matches

### Fix Plan

**Layer 1 — Make `auto-snapshot-usd` org-aware (loop per org)**

Rewrite the function to:
- Fetch all active organizations
- For EACH org, run the existing pipeline scoped with `.eq("org_id", orgId)` on:
  - `usd_purchases`, `daily_metrics`, `usd_manual_spends`
  - `transactions` (CRITICAL — this fixes the obligations leakage)
  - `usd_inventory_snapshots` reads (baseline lookup, today's snapshot check)
- Write ONE snapshot row per `(snapshot_date, org_id)` — not just per `snapshot_date`

**Layer 2 — DB schema: composite uniqueness**

Add unique index on `usd_inventory_snapshots(snapshot_date, org_id)` and drop the old `(snapshot_date)` constraint. This permits multi-org coexistence per day. Update the upsert `onConflict` accordingly.

**Layer 3 — Frontend: read snapshot for the user's own org**

In `WalletInventory.tsx` `fetchOverview()`, scope the snapshot read with `.eq("org_id", profile.org_id)` so each agency reads ITS row, never another org's.

**Layer 4 — One-shot data correction**

Delete today's mis-orged snapshot rows and re-run `auto-snapshot-usd` for each org so the displayed numbers immediately reconcile to the live transaction totals.

### Files Changed

| File | Change |
|---|---|
| `supabase/functions/auto-snapshot-usd/index.ts` | Loop per organization; org-scope every query; write per-org snapshots |
| `src/pages/WalletInventory.tsx` | Add `.eq("org_id", profile.org_id)` to snapshot fetch; gate on `profile.org_id` |
| New migration | Composite unique `(snapshot_date, org_id)`; backfill correction; data cleanup |

### Why This Is Bulletproof
- **Tenant isolation**: Each agency sees only its own client obligations, computed from its own transactions
- **Stable refresh**: Repeated refreshes write to the right row — number stops changing between reloads
- **Self-healing**: One-shot rerun fixes today's snapshot; tomorrow's nightly cron is correct from day one
- **Matches dashboard**: `client_obligations` will now equal the sum of positive client balances shown in `get_admin_dashboard_summary` — the existing trusted source

### Build Time
~6 minutes. 1 edge function rewrite + 1 frontend tweak + 1 migration. Zero breaking changes (just adds correctness).

