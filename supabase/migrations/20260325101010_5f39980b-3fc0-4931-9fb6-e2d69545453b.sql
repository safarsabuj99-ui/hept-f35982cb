
-- Step 1: Create auto_pause_on_debit trigger function
CREATE OR REPLACE FUNCTION public.auto_pause_on_debit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_balance numeric;
  v_total_deposits numeric;
  v_total_debits numeric;
  v_pause_threshold numeric;
  v_overdraft numeric;
  v_effective_threshold numeric;
  v_already_paused jsonb;
  v_campaign_ids uuid[];
  v_campaign_id_strings text[];
  v_count integer;
  v_client_name text;
BEGIN
  -- Only act on completed debit transactions
  IF NEW.type <> 'debit' OR NEW.status <> 'completed' THEN
    RETURN NEW;
  END IF;

  -- Calculate current balance for this client
  SELECT
    COALESCE(SUM(CASE WHEN type = 'credit' AND status = 'completed' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN type = 'debit' AND status = 'completed' THEN amount ELSE 0 END), 0)
  INTO v_total_deposits, v_total_debits
  FROM public.transactions
  WHERE client_id = NEW.client_id;

  v_balance := v_total_deposits - v_total_debits;

  -- Get client's guard settings
  SELECT auto_pause_balance_usd, overdraft_limit_usd, system_paused_campaigns, full_name
  INTO v_pause_threshold, v_overdraft, v_already_paused, v_client_name
  FROM public.profiles
  WHERE user_id = NEW.client_id;

  -- If already has paused campaigns, skip
  IF v_already_paused IS NOT NULL AND jsonb_array_length(v_already_paused) > 0 THEN
    RETURN NEW;
  END IF;

  -- Overdraft-aware threshold: if overdraft > 0, use configured threshold; otherwise use 0
  v_effective_threshold := CASE WHEN COALESCE(v_overdraft, 0) > 0 THEN COALESCE(v_pause_threshold, 5) ELSE 0 END;

  -- Check if balance is at or below threshold
  IF v_balance > v_effective_threshold THEN
    RETURN NEW;
  END IF;

  -- Find all active campaigns for this client
  SELECT array_agg(id)
  INTO v_campaign_ids
  FROM public.campaigns
  WHERE client_id = NEW.client_id
    AND status IN ('active', 'enable', 'Active');

  IF v_campaign_ids IS NULL OR array_length(v_campaign_ids, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  v_count := array_length(v_campaign_ids, 1);

  -- Update campaigns status to guard_paused
  UPDATE public.campaigns
  SET status = 'guard_paused', updated_at = now()
  WHERE id = ANY(v_campaign_ids);

  -- Convert uuid array to text array for jsonb storage
  SELECT array_agg(id::text)
  INTO v_campaign_id_strings
  FROM unnest(v_campaign_ids) AS id;

  -- Store paused campaign IDs in profile
  UPDATE public.profiles
  SET system_paused_campaigns = to_jsonb(v_campaign_id_strings),
      guard_paused_at = now()
  WHERE user_id = NEW.client_id;

  -- Audit log
  INSERT INTO public.audit_logs (user_id, action_type, description)
  VALUES (
    NEW.client_id,
    'ad_guard_pause',
    'Auto-paused ' || v_count || ' campaigns for ' || COALESCE(v_client_name, 'Unknown') || '. Balance: $' || ROUND(v_balance, 2) || ' (threshold: $' || v_effective_threshold || '). Triggered by auto-debit.'
  );

  RETURN NEW;
END;
$function$;

-- Create the trigger
DROP TRIGGER IF EXISTS trg_auto_pause_on_debit ON public.transactions;
CREATE TRIGGER trg_auto_pause_on_debit
  AFTER INSERT ON public.transactions
  FOR EACH ROW
  WHEN (NEW.type = 'debit' AND NEW.status = 'completed')
  EXECUTE FUNCTION public.auto_pause_on_debit();

-- Step 2: Update check_auto_resume to handle guard_paused status in campaigns table
CREATE OR REPLACE FUNCTION public.check_auto_resume()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_client_id uuid;
  v_balance numeric;
  v_total_deposits numeric;
  v_total_debits numeric;
  v_pause_threshold numeric;
  v_paused_campaigns jsonb;
  v_guard_paused_at timestamptz;
  v_resume_window_hours integer;
  v_campaign_ids text[];
BEGIN
  -- Only act on completed credit transactions
  IF NEW.type <> 'credit' OR NEW.status <> 'completed' THEN
    RETURN NEW;
  END IF;

  v_client_id := NEW.client_id;

  -- Calculate current balance
  SELECT
    COALESCE(SUM(CASE WHEN type = 'credit' AND status = 'completed' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN type = 'debit' AND status = 'completed' THEN amount ELSE 0 END), 0)
  INTO v_total_deposits, v_total_debits
  FROM public.transactions
  WHERE client_id = v_client_id;

  v_balance := v_total_deposits - v_total_debits;

  -- Get client's guard settings
  SELECT auto_pause_balance_usd, system_paused_campaigns, guard_paused_at, guard_resume_window_hours
  INTO v_pause_threshold, v_paused_campaigns, v_guard_paused_at, v_resume_window_hours
  FROM public.profiles
  WHERE user_id = v_client_id;

  -- If no paused campaigns, nothing to do
  IF v_paused_campaigns IS NULL OR jsonb_array_length(v_paused_campaigns) = 0 THEN
    RETURN NEW;
  END IF;

  -- Extract campaign IDs from jsonb array
  SELECT array_agg(elem::text)
  INTO v_campaign_ids
  FROM jsonb_array_elements_text(v_paused_campaigns) AS elem;

  -- PRIORITY 1: If balance is sufficient, ALWAYS resume
  IF v_balance > (COALESCE(v_pause_threshold, 5) * 2) THEN
    -- Re-activate campaigns in campaigns table (set back to active)
    UPDATE public.campaigns
    SET status = 'active', updated_at = now()
    WHERE id::text = ANY(v_campaign_ids)
      AND status = 'guard_paused';

    -- Also re-activate campaign mappings
    UPDATE public.campaign_mappings
    SET is_active = true
    WHERE campaign_id = ANY(v_campaign_ids);

    -- Clear system paused campaigns and guard state
    UPDATE public.profiles
    SET system_paused_campaigns = '[]'::jsonb,
        guard_paused_at = NULL
    WHERE user_id = v_client_id;

    -- Log the auto-resume event
    INSERT INTO public.audit_logs (user_id, action_type, description)
    VALUES (
      v_client_id,
      'ad_guard_resume',
      'Auto-resumed ' || array_length(v_campaign_ids, 1) || ' campaigns after deposit. New balance: $' || ROUND(v_balance, 2) || ' (threshold: $' || COALESCE(v_pause_threshold, 5) || ')'
    );

    RETURN NEW;
  END IF;

  -- PRIORITY 2: Balance still insufficient — check if window expired
  IF v_guard_paused_at IS NOT NULL AND 
     now() > v_guard_paused_at + (COALESCE(v_resume_window_hours, 24) * interval '1 hour') THEN
    UPDATE public.profiles
    SET system_paused_campaigns = '[]'::jsonb,
        guard_paused_at = NULL
    WHERE user_id = v_client_id;

    INSERT INTO public.audit_logs (user_id, action_type, description)
    VALUES (
      v_client_id,
      'ad_guard_window_expired',
      'Resume window expired after ' || COALESCE(v_resume_window_hours, 24) || 'h. Campaigns remain guard_paused. Balance: $' || ROUND(v_balance, 2)
    );
  END IF;

  RETURN NEW;
END;
$function$;

-- Recreate the check_auto_resume trigger
DROP TRIGGER IF EXISTS trg_check_auto_resume ON public.transactions;
CREATE TRIGGER trg_check_auto_resume
  AFTER INSERT ON public.transactions
  FOR EACH ROW
  WHEN (NEW.type = 'credit' AND NEW.status = 'completed')
  EXECUTE FUNCTION public.check_auto_resume();
