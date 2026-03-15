
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

  -- PRIORITY 1: If balance is sufficient, ALWAYS resume — regardless of window expiry
  IF v_balance > (COALESCE(v_pause_threshold, 5) * 2) THEN
    -- Re-activate paused campaign mappings
    UPDATE public.campaign_mappings
    SET is_active = true
    WHERE campaign_id IN (
      SELECT jsonb_array_elements_text(v_paused_campaigns)
    );

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
      'Auto-resumed ' || jsonb_array_length(v_paused_campaigns) || ' campaigns after deposit. New balance: $' || ROUND(v_balance, 2) || ' (threshold: $' || COALESCE(v_pause_threshold, 5) || ')'
    );

    RETURN NEW;
  END IF;

  -- PRIORITY 2: Balance still insufficient — check if window expired
  IF v_guard_paused_at IS NOT NULL AND 
     now() > v_guard_paused_at + (COALESCE(v_resume_window_hours, 24) * interval '1 hour') THEN
    -- Window expired + still no money → clear UI status only, keep campaigns paused
    UPDATE public.profiles
    SET system_paused_campaigns = '[]'::jsonb,
        guard_paused_at = NULL
    WHERE user_id = v_client_id;

    INSERT INTO public.audit_logs (user_id, action_type, description)
    VALUES (
      v_client_id,
      'ad_guard_window_expired',
      'Resume window expired after ' || COALESCE(v_resume_window_hours, 24) || 'h. Campaigns remain paused permanently. Balance: $' || ROUND(v_balance, 2)
    );
  END IF;

  RETURN NEW;
END;
$function$;
