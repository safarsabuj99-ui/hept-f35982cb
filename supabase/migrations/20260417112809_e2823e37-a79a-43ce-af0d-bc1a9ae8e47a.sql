-- Drop old function so we can change its return type
DROP FUNCTION IF EXISTS public.claim_sync_jobs(integer);

-- 1. Extend sync_jobs table with chunking columns
ALTER TABLE public.sync_jobs
  ADD COLUMN IF NOT EXISTS parent_job_id uuid,
  ADD COLUMN IF NOT EXISTS chunk_index int,
  ADD COLUMN IF NOT EXISTS chunk_total int,
  ADD COLUMN IF NOT EXISTS date_from date,
  ADD COLUMN IF NOT EXISTS date_to date,
  ADD COLUMN IF NOT EXISTS chunk_strategy text NOT NULL DEFAULT 'full';

CREATE INDEX IF NOT EXISTS idx_sync_jobs_parent ON public.sync_jobs(parent_job_id) WHERE parent_job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sync_jobs_account_status ON public.sync_jobs(ad_account_id, status);

DROP INDEX IF EXISTS sync_jobs_unique_active;
CREATE UNIQUE INDEX IF NOT EXISTS sync_jobs_unique_active_chunk
  ON public.sync_jobs(ad_account_id, function_name, COALESCE(date_from, '1970-01-01'::date))
  WHERE status IN ('pending', 'processing');

-- 2. sync_account_stats
CREATE TABLE IF NOT EXISTS public.sync_account_stats (
  ad_account_id uuid PRIMARY KEY REFERENCES public.ad_accounts(id) ON DELETE CASCADE,
  org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  avg_rows_per_day numeric DEFAULT 0,
  last_full_sync_at timestamptz,
  total_rows_last_sync int DEFAULT 0,
  recommended_chunk_days int DEFAULT 5,
  consecutive_failures int DEFAULT 0,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sync_account_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members can view sync stats" ON public.sync_account_stats;
CREATE POLICY "Org members can view sync stats"
ON public.sync_account_stats FOR SELECT
USING (org_id = get_user_org_id(auth.uid()));

DROP POLICY IF EXISTS "Service role full access stats" ON public.sync_account_stats;
CREATE POLICY "Service role full access stats"
ON public.sync_account_stats FOR ALL
USING (true) WITH CHECK (true);

-- 3. sync_integrity_alerts
CREATE TABLE IF NOT EXISTS public.sync_integrity_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_account_id uuid NOT NULL REFERENCES public.ad_accounts(id) ON DELETE CASCADE,
  org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  alert_type text NOT NULL,
  expected_rows int,
  actual_rows int,
  missing_date_from date,
  missing_date_to date,
  severity text NOT NULL DEFAULT 'warning',
  message text,
  resolved boolean NOT NULL DEFAULT false,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_integrity_alerts_account ON public.sync_integrity_alerts(ad_account_id, resolved);
ALTER TABLE public.sync_integrity_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members view integrity alerts" ON public.sync_integrity_alerts;
CREATE POLICY "Org members view integrity alerts"
ON public.sync_integrity_alerts FOR SELECT
USING (org_id = get_user_org_id(auth.uid()));

DROP POLICY IF EXISTS "Service role full access alerts" ON public.sync_integrity_alerts;
CREATE POLICY "Service role full access alerts"
ON public.sync_integrity_alerts FOR ALL
USING (true) WITH CHECK (true);

-- 4. compute_chunk_days
CREATE OR REPLACE FUNCTION public.compute_chunk_days(p_ad_account_id uuid)
RETURNS int
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_avg numeric;
  v_failures int;
BEGIN
  SELECT avg_rows_per_day, consecutive_failures
  INTO v_avg, v_failures
  FROM public.sync_account_stats
  WHERE ad_account_id = p_ad_account_id;

  IF v_avg IS NULL OR v_avg = 0 THEN RETURN 5; END IF;
  IF v_failures >= 2 THEN RETURN 3; END IF;
  IF v_avg < 4 THEN RETURN 25;
  ELSIF v_avg < 20 THEN RETURN 7;
  ELSIF v_avg < 50 THEN RETURN 5;
  ELSE RETURN 3;
  END IF;
END;
$$;

-- 5. claim_sync_jobs (new return shape with chunk metadata)
CREATE FUNCTION public.claim_sync_jobs(p_limit integer DEFAULT 10)
RETURNS TABLE(
  id uuid,
  ad_account_id uuid,
  function_name text,
  attempts integer,
  max_attempts integer,
  org_id uuid,
  parent_job_id uuid,
  chunk_index int,
  chunk_total int,
  date_from date,
  date_to date,
  chunk_strategy text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.sync_jobs
  SET status = 'pending', started_at = NULL
  WHERE status = 'processing'
    AND started_at < now() - interval '3 minutes';

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
  RETURNING sj.id, sj.ad_account_id, sj.function_name, sj.attempts, sj.max_attempts, sj.org_id,
            sj.parent_job_id, sj.chunk_index, sj.chunk_total, sj.date_from, sj.date_to, sj.chunk_strategy;
END;
$$;

-- 6. mark_parent_complete
CREATE OR REPLACE FUNCTION public.mark_parent_complete(p_job_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parent uuid;
  v_account uuid;
  v_org uuid;
  v_total int;
  v_done int;
  v_failed int;
  v_total_rows int;
  v_min_date date;
  v_max_date date;
  v_days int;
  v_avg numeric;
BEGIN
  SELECT parent_job_id, ad_account_id, org_id
  INTO v_parent, v_account, v_org
  FROM public.sync_jobs WHERE id = p_job_id;

  IF v_parent IS NULL THEN
    SELECT rows_synced INTO v_total_rows FROM public.sync_jobs WHERE id = p_job_id;
    INSERT INTO public.sync_account_stats (ad_account_id, org_id, avg_rows_per_day, total_rows_last_sync, last_full_sync_at, consecutive_failures, recommended_chunk_days, updated_at)
    VALUES (v_account, v_org, COALESCE(v_total_rows, 0)::numeric / 25.0, COALESCE(v_total_rows, 0), now(), 0, 5, now())
    ON CONFLICT (ad_account_id) DO UPDATE
    SET avg_rows_per_day = EXCLUDED.avg_rows_per_day,
        total_rows_last_sync = EXCLUDED.total_rows_last_sync,
        last_full_sync_at = now(),
        consecutive_failures = 0,
        recommended_chunk_days = compute_chunk_days(v_account),
        updated_at = now();
    RETURN jsonb_build_object('parent_complete', true, 'chunks', 1);
  END IF;

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'done'),
    COUNT(*) FILTER (WHERE status = 'failed'),
    COALESCE(SUM(rows_synced), 0),
    MIN(date_from),
    MAX(date_to)
  INTO v_total, v_done, v_failed, v_total_rows, v_min_date, v_max_date
  FROM public.sync_jobs
  WHERE parent_job_id = v_parent;

  IF (v_done + v_failed) < v_total THEN
    RETURN jsonb_build_object('parent_complete', false, 'done', v_done, 'failed', v_failed, 'total', v_total);
  END IF;

  v_days := GREATEST(1, COALESCE(v_max_date - v_min_date, 25));
  v_avg := v_total_rows::numeric / v_days::numeric;

  INSERT INTO public.sync_account_stats (ad_account_id, org_id, avg_rows_per_day, total_rows_last_sync, last_full_sync_at, consecutive_failures, recommended_chunk_days, updated_at)
  VALUES (
    v_account, v_org, v_avg, v_total_rows, now(),
    CASE WHEN v_failed > 0 THEN 1 ELSE 0 END,
    5, now()
  )
  ON CONFLICT (ad_account_id) DO UPDATE
  SET avg_rows_per_day = v_avg,
      total_rows_last_sync = v_total_rows,
      last_full_sync_at = now(),
      consecutive_failures = CASE WHEN v_failed > 0 THEN sync_account_stats.consecutive_failures + 1 ELSE 0 END,
      recommended_chunk_days = compute_chunk_days(v_account),
      updated_at = now();

  IF v_failed > 0 THEN
    INSERT INTO public.sync_integrity_alerts (ad_account_id, org_id, alert_type, severity, message)
    VALUES (
      v_account, v_org, 'failed_chunks', 'high',
      v_failed || ' of ' || v_total || ' chunks failed during sync. Will retry on next run.'
    );
  END IF;

  RETURN jsonb_build_object(
    'parent_complete', true,
    'chunks', v_total,
    'done', v_done,
    'failed', v_failed,
    'total_rows', v_total_rows
  );
END;
$$;

-- 7. bump_failure_count trigger
CREATE OR REPLACE FUNCTION public.bump_failure_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'failed' AND OLD.status <> 'failed' THEN
    INSERT INTO public.sync_account_stats (ad_account_id, org_id, consecutive_failures, last_error, updated_at)
    VALUES (NEW.ad_account_id, NEW.org_id, 1, NEW.last_error, now())
    ON CONFLICT (ad_account_id) DO UPDATE
    SET consecutive_failures = sync_account_stats.consecutive_failures + 1,
        last_error = NEW.last_error,
        updated_at = now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_jobs_bump_failure ON public.sync_jobs;
CREATE TRIGGER sync_jobs_bump_failure
AFTER UPDATE ON public.sync_jobs
FOR EACH ROW
WHEN (NEW.status = 'failed' AND OLD.status IS DISTINCT FROM 'failed')
EXECUTE FUNCTION public.bump_failure_count();