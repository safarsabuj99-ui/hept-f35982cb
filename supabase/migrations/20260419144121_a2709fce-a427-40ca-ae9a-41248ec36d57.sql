
-- Sync reconciliation log: tracks drift between platform-reported spend and DB-stored spend
CREATE TABLE IF NOT EXISTS public.sync_reconciliation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_account_id uuid NOT NULL REFERENCES public.ad_accounts(id) ON DELETE CASCADE,
  org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  platform public.ad_platform NOT NULL,
  date_from date NOT NULL,
  date_to date NOT NULL,
  api_total_spend numeric NOT NULL DEFAULT 0,
  db_total_spend numeric NOT NULL DEFAULT 0,
  delta numeric NOT NULL DEFAULT 0,
  rows_processed integer NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sync_recon_account_created
  ON public.sync_reconciliation_log (ad_account_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sync_recon_drift
  ON public.sync_reconciliation_log (created_at DESC)
  WHERE abs(delta) > 0.10;

ALTER TABLE public.sync_reconciliation_log ENABLE ROW LEVEL SECURITY;

-- Admins of the same org can view; service role bypasses RLS for writes
CREATE POLICY "Org admins can view reconciliation log"
ON public.sync_reconciliation_log
FOR SELECT
TO authenticated
USING (
  org_id = public.get_user_org_id(auth.uid())
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'platform_owner'))
);

-- Auto-fill org_id from ad_account on insert (safety net for service-role inserts that omit it)
CREATE TRIGGER set_org_id_sync_recon
BEFORE INSERT ON public.sync_reconciliation_log
FOR EACH ROW
EXECUTE FUNCTION public.set_org_id_from_ad_account();
