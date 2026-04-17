-- Sync job queue table
CREATE TABLE public.sync_jobs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ad_account_id uuid NOT NULL REFERENCES public.ad_accounts(id) ON DELETE CASCADE,
  function_name text NOT NULL CHECK (function_name IN ('sync-deep-dive', 'sync-fast-lane')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'done', 'failed')),
  attempts int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 3,
  last_error text,
  error_code text,
  rows_synced int DEFAULT 0,
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for fast queue draining
CREATE INDEX idx_sync_jobs_status_scheduled ON public.sync_jobs(status, scheduled_at) WHERE status IN ('pending', 'processing');
CREATE INDEX idx_sync_jobs_org ON public.sync_jobs(org_id, status);
CREATE INDEX idx_sync_jobs_created ON public.sync_jobs(created_at DESC);

-- Prevent duplicate active jobs per (account, function)
CREATE UNIQUE INDEX idx_sync_jobs_unique_active 
  ON public.sync_jobs(ad_account_id, function_name) 
  WHERE status IN ('pending', 'processing');

-- Org_id auto-fill trigger
CREATE TRIGGER set_org_id_on_sync_jobs
BEFORE INSERT ON public.sync_jobs
FOR EACH ROW
EXECUTE FUNCTION public.set_org_id_from_ad_account();

-- Enable RLS
ALTER TABLE public.sync_jobs ENABLE ROW LEVEL SECURITY;

-- Admins can view their org's jobs
CREATE POLICY "Admins view org sync jobs"
ON public.sync_jobs FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  AND org_id = get_user_org_id(auth.uid())
);

-- Platform owners can view all
CREATE POLICY "Platform owners view all sync jobs"
ON public.sync_jobs FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'platform_owner'::app_role));

-- Admins can delete (clear failed) their org's jobs
CREATE POLICY "Admins delete org sync jobs"
ON public.sync_jobs FOR DELETE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  AND org_id = get_user_org_id(auth.uid())
);

-- Admins can update (retry) their org's jobs
CREATE POLICY "Admins update org sync jobs"
ON public.sync_jobs FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  AND org_id = get_user_org_id(auth.uid())
);

-- Atomic claim function - returns N pending jobs and marks them processing
CREATE OR REPLACE FUNCTION public.claim_sync_jobs(p_limit int DEFAULT 10)
RETURNS TABLE (
  id uuid,
  ad_account_id uuid,
  function_name text,
  attempts int,
  max_attempts int,
  org_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- First, recover stuck "processing" jobs (>2min old)
  UPDATE public.sync_jobs
  SET status = 'pending', started_at = NULL
  WHERE status = 'processing' 
    AND started_at < now() - interval '2 minutes';

  -- Atomically claim N pending jobs
  RETURN QUERY
  WITH claimed AS (
    SELECT sj.id
    FROM public.sync_jobs sj
    WHERE sj.status = 'pending'
      AND sj.scheduled_at <= now()
    ORDER BY sj.scheduled_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.sync_jobs sj
  SET status = 'processing',
      started_at = now(),
      attempts = sj.attempts + 1
  FROM claimed
  WHERE sj.id = claimed.id
  RETURNING sj.id, sj.ad_account_id, sj.function_name, sj.attempts, sj.max_attempts, sj.org_id;
END;
$$;