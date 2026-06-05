CREATE OR REPLACE FUNCTION public.enforce_manual_snapshot_baseline()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.created_by IS NOT NULL
     AND NEW.created_by <> '00000000-0000-0000-0000-000000000000'::uuid
     AND NEW.baseline_balance_usd IS NULL
  THEN
    RAISE EXCEPTION 'Manual USD snapshots (opening balance / period close) must set baseline_balance_usd';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_manual_snapshot_baseline ON public.usd_inventory_snapshots;
CREATE TRIGGER trg_enforce_manual_snapshot_baseline
BEFORE INSERT OR UPDATE ON public.usd_inventory_snapshots
FOR EACH ROW
EXECUTE FUNCTION public.enforce_manual_snapshot_baseline();