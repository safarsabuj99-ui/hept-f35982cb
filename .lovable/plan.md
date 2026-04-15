

## Plan: Fix Client Obligations Not Showing on Manual Baseline Days

### Problem

When a manual baseline snapshot exists for today (like the -$125.71 close), the `auto-snapshot-usd` edge function **skips the entire upsert** (line 178). This means client obligations, USD needed, client balances breakdown, burn rate, and runway are all stuck at whatever was set during the manual insert — which was zeroed out.

The screenshot confirms: Client Obligations shows $0, USD Needed shows $0, and no client breakdown appears.

### Fix

**File: `supabase/functions/auto-snapshot-usd/index.ts`**

Change the manual baseline logic: instead of skipping entirely, **update only the `metrics` JSONB and `notes`** while preserving the manual `balance_usd` and `created_by`. This way:
- The carry-forward balance stays at -$125.71 (protected)
- Client obligations, burn rate, runway, and per-client breakdown are recalculated on every refresh

```typescript
// Before (line 178-179):
if (isManualToday) {
  console.log(`Skipping upsert — today has a manual baseline`);
}

// After:
if (isManualToday) {
  // Update metrics only — preserve balance_usd and created_by
  const { error: metricErr } = await supabase
    .from("usd_inventory_snapshots")
    .update({ metrics, notes: `Manual baseline — metrics refreshed (${timestamp})` })
    .eq("snapshot_date", today);
  if (metricErr) throw metricErr;
}
```

### Result

After deploying, clicking "Refresh" will populate client obligations, USD needed, per-client breakdown, burn rate, and runway — even on days with a manual baseline snapshot.

### Files Changed

| File | Change |
|------|--------|
| `supabase/functions/auto-snapshot-usd/index.ts` | Update metrics on manual baseline days instead of skipping |

