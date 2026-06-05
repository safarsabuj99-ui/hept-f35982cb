UPDATE public.usd_inventory_snapshots
SET baseline_balance_usd = 221.32, balance_usd = 221.32
WHERE snapshot_date = '2026-05-31'
  AND org_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
  AND notes ILIKE 'Period close%';

UPDATE public.usd_inventory_snapshots
SET baseline_balance_usd = 42, balance_usd = 42
WHERE snapshot_date = '2026-06-04'
  AND org_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
  AND notes ILIKE 'Period close%';