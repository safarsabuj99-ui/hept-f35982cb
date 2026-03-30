
-- Step 1: Add durable pause state columns to campaigns
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS pause_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pause_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS pause_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS pause_attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pause_error text;

-- Step 2: Create guard_pause_jobs queue table
CREATE TABLE IF NOT EXISTS public.guard_pause_jobs (
  id bigserial PRIMARY KEY,
  campaign_id uuid NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending',
  available_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.guard_pause_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_guard_pause_jobs" ON public.guard_pause_jobs
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Step 3: Drop the fragile instant_guard_pause trigger
DROP TRIGGER IF EXISTS trg_instant_guard_pause ON public.campaigns;
DROP FUNCTION IF EXISTS public.instant_guard_pause();

-- Step 4: Replace auto_pause_on_debit with durable version
CREATE OR REPLACE FUNCTION public.auto_pause_on_debit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $func$
DECLARE
  v_balance numeric;
  v_pause_threshold numeric;
  v_overdraft numeric;
  v_effective_threshold numeric;
  v_already_paused jsonb;
  v_campaign_ids uuid[];
  v_campaign_id_strings text[];
  v_count integer;
  v_client_name text;
BEGIN
  IF NEW.type <> 'debit' OR NEW.status <> 'completed' THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(CASE WHEN type = 'credit' AND status = 'completed' THEN amount ELSE 0 END), 0)
       - COALESCE(SUM(CASE WHEN type = 'debit' AND status = 'completed' THEN amount ELSE 0 END), 0)
  INTO v_balance
  FROM public.transactions
  WHERE client_id = NEW.client_id;

  SELECT auto_pause_balance_usd, overdraft_limit_usd, system_paused_campaigns, full_name
  INTO v_pause_threshold, v_overdraft, v_already_paused, v_client_name
  FROM public.profiles
  WHERE user_id = NEW.client_id;

  v_effective_threshold := COALESCE(v_pause_threshold, 5) - COALESCE(v_overdraft, 0);

  IF v_balance > v_effective_threshold THEN
    RETURN NEW;
  END IF;

  SELECT array_agg(id)
  INTO v_campaign_ids
  FROM public.campaigns
  WHERE client_id = NEW.client_id
    AND status IN ('active', 'enable', 'Active');

  IF v_campaign_ids IS NULL OR array_length(v_campaign_ids, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  v_count := array_length(v_campaign_ids, 1);

  -- Mark as guard_paused AND set pause_required for the durable queue
  UPDATE public.campaigns
  SET status = 'guard_paused',
      pause_required = true,
      pause_requested_at = COALESCE(pause_requested_at, now()),
      pause_confirmed_at = NULL,
      pause_attempt_count = 0,
      pause_error = NULL,
      updated_at = now()
  WHERE id = ANY(v_campaign_ids);

  -- Insert into durable queue (idempotent)
  INSERT INTO public.guard_pause_jobs (campaign_id, status, available_at)
  SELECT unnest(v_campaign_ids), 'pending', now()
  ON CONFLICT (campaign_id) DO UPDATE SET
    status = 'pending',
    available_at = now(),
    last_error = NULL;

  SELECT array_agg(DISTINCT val)
  INTO v_campaign_id_strings
  FROM (
    SELECT unnest(v_campaign_ids)::text AS val
    UNION
    SELECT jsonb_array_elements_text(COALESCE(v_already_paused, '[]'::jsonb)) AS val
  ) combined;

  UPDATE public.profiles
  SET system_paused_campaigns = to_jsonb(v_campaign_id_strings),
      guard_paused_at = COALESCE(guard_paused_at, now())
  WHERE user_id = NEW.client_id;

  INSERT INTO public.audit_logs (user_id, action_type, description)
  VALUES (
    NEW.client_id,
    'ad_guard_pause',
    'Auto-paused ' || v_count || ' campaigns for ' || COALESCE(v_client_name, 'Unknown') || '. Balance: $' || ROUND(v_balance, 2) || ' (threshold: $' || v_effective_threshold || '). Queued for platform pause.'
  );

  RETURN NEW;
END;
$func$;

-- Step 5: Update check_auto_resume to also clear pause state
CREATE OR REPLACE FUNCTION public.check_auto_resume()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $func$
DECLARE
  v_client_id uuid;
  v_balance numeric;
  v_pause_threshold numeric;
  v_overdraft numeric;
  v_effective_threshold numeric;
  v_paused_campaigns jsonb;
  v_campaign_ids text[];
BEGIN
  IF NEW.type <> 'credit' OR NEW.status <> 'completed' THEN
    RETURN NEW;
  END IF;

  v_client_id := NEW.client_id;

  SELECT COALESCE(SUM(CASE WHEN type = 'credit' AND status = 'completed' THEN amount ELSE 0 END), 0)
       - COALESCE(SUM(CASE WHEN type = 'debit' AND status = 'completed' THEN amount ELSE 0 END), 0)
  INTO v_balance
  FROM public.transactions
  WHERE client_id = v_client_id;

  SELECT auto_pause_balance_usd, overdraft_limit_usd, system_paused_campaigns
  INTO v_pause_threshold, v_overdraft, v_paused_campaigns
  FROM public.profiles
  WHERE user_id = v_client_id;

  IF v_paused_campaigns IS NULL OR jsonb_array_length(v_paused_campaigns) = 0 THEN
    RETURN NEW;
  END IF;

  v_effective_threshold := COALESCE(v_pause_threshold, 5) - COALESCE(v_overdraft, 0);

  IF v_balance <= v_effective_threshold THEN
    RETURN NEW;
  END IF;

  SELECT array_agg(elem::text)
  INTO v_campaign_ids
  FROM jsonb_array_elements_text(v_paused_campaigns) AS elem;

  -- Re-activate and clear pause state
  UPDATE public.campaigns
  SET status = 'active',
      pause_required = false,
      pause_requested_at = NULL,
      pause_confirmed_at = NULL,
      pause_attempt_count = 0,
      pause_error = NULL,
      updated_at = now()
  WHERE id::text = ANY(v_campaign_ids)
    AND status IN ('guard_paused', 'paused');

  -- Remove from queue
  DELETE FROM public.guard_pause_jobs
  WHERE campaign_id::text = ANY(v_campaign_ids);

  UPDATE public.profiles
  SET system_paused_campaigns = '[]'::jsonb,
      guard_paused_at = NULL
  WHERE user_id = v_client_id;

  INSERT INTO public.audit_logs (user_id, action_type, description)
  VALUES (
    v_client_id,
    'ad_guard_resume',
    'Auto-resumed ' || array_length(v_campaign_ids, 1) || ' campaigns after deposit. New balance: $' || ROUND(v_balance, 2) || ' (threshold: $' || v_effective_threshold || ')'
  );

  RETURN NEW;
END;
$func$;

-- Step 6: Enable pg_cron and pg_net extensions
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
