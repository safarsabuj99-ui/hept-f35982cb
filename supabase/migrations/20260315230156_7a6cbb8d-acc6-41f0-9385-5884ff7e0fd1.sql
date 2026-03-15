
-- 1. Add lifecycle columns to organizations
ALTER TABLE public.organizations 
  ADD COLUMN IF NOT EXISTS grace_period_days integer NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS status_changed_at timestamptz NOT NULL DEFAULT now();

-- 2. Add due_date to platform_invoices
ALTER TABLE public.platform_invoices 
  ADD COLUMN IF NOT EXISTS due_date date;

-- 3. Create mrr_snapshots table
CREATE TABLE IF NOT EXISTS public.mrr_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_month date NOT NULL,
  total_mrr numeric NOT NULL DEFAULT 0,
  new_mrr numeric NOT NULL DEFAULT 0,
  churned_mrr numeric NOT NULL DEFAULT 0,
  expansion_mrr numeric NOT NULL DEFAULT 0,
  contraction_mrr numeric NOT NULL DEFAULT 0,
  active_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(snapshot_month)
);

ALTER TABLE public.mrr_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_owner_all_mrr_snapshots" ON public.mrr_snapshots
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'platform_owner'::app_role))
  WITH CHECK (has_role(auth.uid(), 'platform_owner'::app_role));
