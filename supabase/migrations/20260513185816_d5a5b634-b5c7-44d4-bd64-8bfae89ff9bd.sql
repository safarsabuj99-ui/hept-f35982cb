
CREATE TABLE public.cash_flow_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid,
  snapshot_date timestamptz NOT NULL DEFAULT now(),
  period_start_date timestamptz NOT NULL,
  opening_balance_bdt numeric NOT NULL DEFAULT 0,
  closing_balance_bdt numeric NOT NULL DEFAULT 0,
  take_home_profit_bdt numeric NOT NULL DEFAULT 0,
  carry_forward_bdt numeric NOT NULL DEFAULT 0,
  variance_bdt numeric NOT NULL DEFAULT 0,
  note text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_cash_flow_snapshots_org_date ON public.cash_flow_snapshots (org_id, snapshot_date DESC);

ALTER TABLE public.cash_flow_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_all_cash_flow_snapshots ON public.cash_flow_snapshots
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) AND org_id = get_user_org_id(auth.uid()))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND org_id = get_user_org_id(auth.uid()));

CREATE POLICY platform_owner_all_cash_flow_snapshots ON public.cash_flow_snapshots
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'platform_owner'::app_role))
  WITH CHECK (has_role(auth.uid(), 'platform_owner'::app_role));

-- Auto-populate org_id from creator's profile
CREATE OR REPLACE FUNCTION public.set_cash_flow_snapshot_org_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.org_id IS NULL THEN
    NEW.org_id := get_user_org_id(auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_cash_flow_snapshot_org_id
BEFORE INSERT ON public.cash_flow_snapshots
FOR EACH ROW EXECUTE FUNCTION public.set_cash_flow_snapshot_org_id();
