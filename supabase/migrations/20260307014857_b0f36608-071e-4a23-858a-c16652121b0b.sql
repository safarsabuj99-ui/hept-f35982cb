
-- Add dollar-based threshold column
ALTER TABLE public.profiles ADD COLUMN auto_pause_balance_usd numeric NOT NULL DEFAULT 5;

-- Update auto-resume trigger to use balance-based logic
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
  SELECT auto_pause_balance_usd, system_paused_campaigns
  INTO v_pause_threshold, v_paused_campaigns
  FROM public.profiles
  WHERE user_id = v_client_id;

  -- If balance is now above double the threshold and there are paused campaigns, auto-resume
  IF v_balance > (COALESCE(v_pause_threshold, 5) * 2) AND v_paused_campaigns IS NOT NULL AND jsonb_array_length(v_paused_campaigns) > 0 THEN
    -- Re-activate paused campaign mappings
    UPDATE public.campaign_mappings
    SET is_active = true
    WHERE campaign_id IN (
      SELECT jsonb_array_elements_text(v_paused_campaigns)
    );

    -- Clear system paused campaigns
    UPDATE public.profiles
    SET system_paused_campaigns = '[]'::jsonb
    WHERE user_id = v_client_id;

    -- Log the auto-resume event
    INSERT INTO public.audit_logs (user_id, action_type, description)
    VALUES (
      v_client_id,
      'ad_guard_resume',
      'Auto-resumed ' || jsonb_array_length(v_paused_campaigns) || ' campaigns. New balance: $' || ROUND(v_balance, 2) || ' (threshold: $' || COALESCE(v_pause_threshold, 5) || ')'
    );
  END IF;

  RETURN NEW;
END;
$function$;
