
CREATE TABLE public.usd_inventory_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date date NOT NULL,
  balance_usd numeric NOT NULL DEFAULT 0,
  notes text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.usd_inventory_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_usd_inventory_snapshots"
ON public.usd_inventory_snapshots
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));
