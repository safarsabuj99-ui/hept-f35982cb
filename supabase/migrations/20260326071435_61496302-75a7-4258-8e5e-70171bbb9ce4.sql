
-- Fix auto_pause_on_debit: correct threshold logic
-- Formula: effective_threshold = threshold - overdraft
-- threshold=$5, overdraft=$0 → pause at $5
-- threshold=$5, overdraft=$10 → pause at -$5
CREATE OR REPLACE FUNCTION public.auto_pause_on_debit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  -- Only act on completed debit transactions
  IF NEW.type <> 'debit' OR NEW.status <> 'completed' THEN
    RETURN NEW;
  END IF;

  -- Calculate current balance using SUM (no row limit)
  SELECT COALESCE(SUM(CASE WHEN type = 'credit' AND status = 'completed' THEN amount ELSE 0 END), 0)
       - COALESCE(SUM(CASE WHEN type = 'debit' AND status = 'completed' THEN amount ELSE 0 END), 0)
  INTO v_balance
  FROM public.transactions
  WHERE client_id = NEW.client_id;

  -- Get client's guard settings
  SELECT auto_pause_balance_usd, overdraft_limit_usd, system_paused_campaigns, full_name
  INTO v_pause_threshold, v_overdraft, v_already_paused, v_client_name
  FROM public.profiles
  WHERE user_id = NEW.client_id;

  -- Correct threshold: threshold - overdraft
  -- threshold=$5, overdraft=$0 → pause at $5
  -- threshold=$5, overdraft=$10 → pause at -$5 (client can go negative)
  v_effective_threshold := COALESCE(v_pause_threshold, 5) - COALESCE(v_overdraft, 0);

  -- Check if balance is above threshold — no action needed
  IF v_balance > v_effective_threshold THEN
    RETURN NEW;
  END IF;

  -- Find ALL active campaigns for this client (including new ones not in system_paused_campaigns)
  SELECT array_agg(id)
  INTO v_campaign_ids
  FROM public.campaigns
  WHERE client_id = NEW.client_id
    AND status IN ('active', 'enable', 'Active');

  IF v_campaign_ids IS NULL OR array_length(v_campaign_ids, 1) IS NULL THEN
    -- No active campaigns to pause, but if already_paused exists, keep it
    RETURN NEW;
  END IF;

  v_count := array_length(v_campaign_ids, 1);

  -- Update campaigns status to guard_paused
  UPDATE public.campaigns
  SET status = 'guard_paused', updated_at = now()
  WHERE id = ANY(v_campaign_ids);

  -- Build complete list: merge existing paused + newly paused
  SELECT array_agg(DISTINCT val)
  INTO v_campaign_id_strings
  FROM (
    SELECT unnest(v_campaign_ids)::text AS val
    UNION
    SELECT jsonb_array_elements_text(COALESCE(v_already_paused, '[]'::jsonb)) AS val
  ) combined;

  -- Store paused campaign IDs in profile
  UPDATE public.profiles
  SET system_paused_campaigns = to_jsonb(v_campaign_id_strings),
      guard_paused_at = COALESCE(guard_paused_at, now())
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

-- Fix check_auto_resume: correct threshold logic, simpler resume condition
CREATE OR REPLACE FUNCTION public.check_auto_resume()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_client_id uuid;
  v_balance numeric;
  v_pause_threshold numeric;
  v_overdraft numeric;
  v_effective_threshold numeric;
  v_paused_campaigns jsonb;
  v_campaign_ids text[];
BEGIN
  -- Only act on completed credit transactions
  IF NEW.type <> 'credit' OR NEW.status <> 'completed' THEN
    RETURN NEW;
  END IF;

  v_client_id := NEW.client_id;

  -- Calculate current balance using SUM
  SELECT COALESCE(SUM(CASE WHEN type = 'credit' AND status = 'completed' THEN amount ELSE 0 END), 0)
       - COALESCE(SUM(CASE WHEN type = 'debit' AND status = 'completed' THEN amount ELSE 0 END), 0)
  INTO v_balance
  FROM public.transactions
  WHERE client_id = v_client_id;

  -- Get client's guard settings
  SELECT auto_pause_balance_usd, overdraft_limit_usd, system_paused_campaigns
  INTO v_pause_threshold, v_overdraft, v_paused_campaigns
  FROM public.profiles
  WHERE user_id = v_client_id;

  -- If no paused campaigns, nothing to do
  IF v_paused_campaigns IS NULL OR jsonb_array_length(v_paused_campaigns) = 0 THEN
    RETURN NEW;
  END IF;

  -- Same threshold formula as pause trigger
  v_effective_threshold := COALESCE(v_pause_threshold, 5) - COALESCE(v_overdraft, 0);

  -- Resume when balance is above the threshold (not 2x — simpler and predictable)
  IF v_balance <= v_effective_threshold THEN
    RETURN NEW; -- Still below threshold, don't resume
  END IF;

  -- Extract campaign IDs
  SELECT array_agg(elem::text)
  INTO v_campaign_ids
  FROM jsonb_array_elements_text(v_paused_campaigns) AS elem;

  -- Re-activate guard_paused campaigns
  UPDATE public.campaigns
  SET status = 'active', updated_at = now()
  WHERE id::text = ANY(v_campaign_ids)
    AND status = 'guard_paused';

  -- Clear system paused state
  UPDATE public.profiles
  SET system_paused_campaigns = '[]'::jsonb,
      guard_paused_at = NULL
  WHERE user_id = v_client_id;

  -- Log the auto-resume
  INSERT INTO public.audit_logs (user_id, action_type, description)
  VALUES (
    v_client_id,
    'ad_guard_resume',
    'Auto-resumed ' || array_length(v_campaign_ids, 1) || ' campaigns after deposit. New balance: $' || ROUND(v_balance, 2) || ' (threshold: $' || v_effective_threshold || ')'
  );

  RETURN NEW;
END;
$function$;
