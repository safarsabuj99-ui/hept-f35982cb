
CREATE TABLE IF NOT EXISTS public.deep_dive_backlog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_account_id uuid NOT NULL REFERENCES public.ad_accounts(id) ON DELETE CASCADE,
  org_id uuid NOT NULL,
  data_date date NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  last_error_code text,
  next_retry_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ad_account_id, data_date)
);

GRANT SELECT ON public.deep_dive_backlog TO authenticated;
GRANT ALL ON public.deep_dive_backlog TO service_role;

ALTER TABLE public.deep_dive_backlog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can read their backlog"
  ON public.deep_dive_backlog
  FOR SELECT
  TO authenticated
  USING (org_id = public.get_user_org_id(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_deep_dive_backlog_retry
  ON public.deep_dive_backlog (next_retry_at);
CREATE INDEX IF NOT EXISTS idx_deep_dive_backlog_account
  ON public.deep_dive_backlog (ad_account_id, data_date);

CREATE TRIGGER deep_dive_backlog_updated_at
  BEFORE UPDATE ON public.deep_dive_backlog
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.mark_parent_complete(p_job_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_recommended int;
  v_self_rows int;
  v_self_status text;
  v_success_ratio numeric;
BEGIN
  SELECT parent_job_id, ad_account_id, org_id, rows_synced, status
  INTO v_parent, v_account, v_org, v_self_rows, v_self_status
  FROM public.sync_jobs WHERE id = p_job_id;

  IF v_parent IS NULL THEN
    v_total_rows := COALESCE(v_self_rows, 0);
    v_recommended := CASE
      WHEN v_total_rows > 800 THEN 3
      WHEN v_total_rows > 400 THEN 5
      WHEN v_total_rows > 150 THEN 10
      ELSE 25
    END;

    INSERT INTO public.sync_account_stats (
      ad_account_id, org_id, avg_rows_per_day, total_rows_last_sync,
      last_full_sync_at, consecutive_failures, recommended_chunk_days, updated_at
    )
    VALUES (
      v_account, v_org, v_total_rows::numeric / 25.0, v_total_rows,
      now(),
      CASE WHEN v_self_status = 'failed' THEN 1 ELSE 0 END,
      v_recommended, now()
    )
    ON CONFLICT (ad_account_id) DO UPDATE
    SET avg_rows_per_day = EXCLUDED.avg_rows_per_day,
        total_rows_last_sync = EXCLUDED.total_rows_last_sync,
        last_full_sync_at = now(),
        consecutive_failures = CASE
          WHEN v_self_status = 'failed' THEN sync_account_stats.consecutive_failures + 1
          ELSE sync_account_stats.consecutive_failures
        END,
        recommended_chunk_days = EXCLUDED.recommended_chunk_days,
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
  v_success_ratio := v_done::numeric / GREATEST(v_total, 1)::numeric;

  v_recommended := CASE
    WHEN v_total_rows > 800 THEN 3
    WHEN v_total_rows > 400 THEN 5
    WHEN v_total_rows > 150 THEN 10
    ELSE 25
  END;

  INSERT INTO public.sync_account_stats (
    ad_account_id, org_id, avg_rows_per_day, total_rows_last_sync,
    last_full_sync_at, consecutive_failures, recommended_chunk_days, updated_at
  )
  VALUES (
    v_account, v_org, v_avg, v_total_rows, now(),
    CASE WHEN v_failed > 0 THEN 1 ELSE 0 END,
    v_recommended, now()
  )
  ON CONFLICT (ad_account_id) DO UPDATE
  SET avg_rows_per_day = v_avg,
      total_rows_last_sync = v_total_rows,
      last_full_sync_at = now(),
      consecutive_failures = CASE
        WHEN v_failed = 0 AND v_success_ratio >= 0.95 THEN 0
        WHEN v_failed > 0 THEN sync_account_stats.consecutive_failures + 1
        ELSE sync_account_stats.consecutive_failures
      END,
      recommended_chunk_days = v_recommended,
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
    'total_rows', v_total_rows,
    'success_ratio', v_success_ratio
  );
END;
$function$;
