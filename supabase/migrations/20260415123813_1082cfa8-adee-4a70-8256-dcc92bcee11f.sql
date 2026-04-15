
ALTER TABLE public.usd_inventory_snapshots
ADD COLUMN IF NOT EXISTS baseline_balance_usd NUMERIC;

-- Repair corrupted manual baseline row: restore original value
UPDATE public.usd_inventory_snapshots
SET baseline_balance_usd = -125.71
WHERE snapshot_date = '2026-04-15'
  AND created_by != '00000000-0000-0000-0000-000000000000';
