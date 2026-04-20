-- 1. Drop the global unique constraint on snapshot_date
ALTER TABLE public.usd_inventory_snapshots
DROP CONSTRAINT IF EXISTS usd_inventory_snapshots_snapshot_date_key;

-- Also drop any unique index variant
DROP INDEX IF EXISTS public.usd_inventory_snapshots_snapshot_date_key;
DROP INDEX IF EXISTS public.usd_inventory_snapshots_snapshot_date_idx;

-- 2. Add composite unique constraint on (snapshot_date, org_id)
ALTER TABLE public.usd_inventory_snapshots
ADD CONSTRAINT usd_inventory_snapshots_date_org_unique
UNIQUE (snapshot_date, org_id);

-- 3. Clean up today's auto-generated snapshot rows so the rewritten function
--    can rebuild correct per-org snapshots on next run.
--    (Manual baselines — created_by != system UUID — are preserved.)
DELETE FROM public.usd_inventory_snapshots
WHERE snapshot_date = (CURRENT_DATE AT TIME ZONE 'Asia/Dhaka')::date
  AND created_by = '00000000-0000-0000-0000-000000000000';