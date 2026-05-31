
-- Deep-Dive resilience: cursor checkpoints + campaign-slice axis + legacy-write flag

ALTER TABLE public.sync_jobs
  ADD COLUMN IF NOT EXISTS cursor_date date,
  ADD COLUMN IF NOT EXISTS campaign_offset integer,
  ADD COLUMN IF NOT EXISTS campaign_limit integer,
  ADD COLUMN IF NOT EXISTS last_progress_at timestamptz;

INSERT INTO public.settings(key, value)
VALUES ('enable_legacy_perf_write','false')
ON CONFLICT (key) DO NOTHING;

-- Tighter adaptive chunking for heavy accounts
CREATE OR REPLACE FUNCTION public.compute_chunk_days(p_ad_account_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_avg numeric;
  v_failures int;
BEGIN
  SELECT avg_rows_per_day, consecutive_failures
  INTO v_avg, v_failures
  FROM public.sync_account_stats
  WHERE ad_account_id = p_ad_account_id;

  IF v_avg IS NULL OR v_avg = 0 THEN RETURN 3; END IF;
  IF v_failures >= 2 THEN RETURN 1; END IF;
  IF v_avg < 4 THEN RETURN 15;
  ELSIF v_avg < 20 THEN RETURN 5;
  ELSIF v_avg < 50 THEN RETURN 3;
  ELSE RETURN 1;
  END IF;
END;
$function$;
