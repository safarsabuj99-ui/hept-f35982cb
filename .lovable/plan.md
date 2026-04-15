

## Plan: Close USD Inventory & Reopen at -$125.71

### What This Does

Closes the current USD inventory period by inserting a **manual baseline snapshot** for today (2026-04-15) with a balance of **-$125.71**. The `auto-snapshot-usd` edge function recognizes manual snapshots (where `created_by` is not the system UUID) and uses them as the carry-forward starting point — it will never overwrite a manual baseline.

Going forward, the balance formula becomes: `-125.71 + future_purchases - future_spend - future_manual_spends`.

### Actions

**1. Upsert today's snapshot as a manual baseline**

Using the insert tool, upsert into `usd_inventory_snapshots`:
- `snapshot_date`: 2026-04-15
- `balance_usd`: -125.71
- `created_by`: the admin's actual user ID (not the system zero-UUID)
- `org_id`: a1b2c3d4-e5f6-7890-abcd-ef1234567890
- `notes`: "Period close — reopened at -$125.71"
- `metrics`: carry_forward of -125.71, zeroed bought/spent/manual counters

**2. Trigger `auto-snapshot-usd`** to verify it picks up the new baseline and skips overwriting today's manual entry.

### Result

The wallet dashboard will show **-$125.71** as the available balance, and all future auto-snapshots will compute relative to this new baseline.

