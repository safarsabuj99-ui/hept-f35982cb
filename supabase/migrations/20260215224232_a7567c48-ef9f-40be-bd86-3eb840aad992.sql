
-- Add Ad Guard columns to profiles table
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS auto_pause_threshold_pct integer NOT NULL DEFAULT 95,
  ADD COLUMN IF NOT EXISTS overdraft_limit_usd numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS system_paused_campaigns jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Create auto-resume function triggered on credit transactions
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
  v_overdraft numeric;
  v_threshold integer;
  v_utilization numeric;
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
  SELECT auto_pause_threshold_pct, overdraft_limit_usd, system_paused_campaigns
  INTO v_threshold, v_overdraft, v_paused_campaigns
  FROM public.profiles
  WHERE user_id = v_client_id;

  -- Check if utilization is now below safe zone (80% of threshold)
  IF v_total_deposits + v_overdraft > 0 THEN
    v_utilization := (v_total_debits / (v_total_deposits + v_overdraft)) * 100;
  ELSE
    v_utilization := 100;
  END IF;

  -- If utilization dropped below 80% of threshold and there are paused campaigns, auto-resume
  IF v_utilization < (v_threshold * 0.8) AND v_paused_campaigns IS NOT NULL AND jsonb_array_length(v_paused_campaigns) > 0 THEN
    -- Clear system paused campaigns (resume signal)
    UPDATE public.profiles
    SET system_paused_campaigns = '[]'::jsonb
    WHERE user_id = v_client_id;

    -- Log the auto-resume event
    INSERT INTO public.audit_logs (user_id, action_type, description)
    VALUES (
      v_client_id,
      'ad_guard_resume',
      'Auto-resumed ' || jsonb_array_length(v_paused_campaigns) || ' campaigns. New balance: $' || ROUND(v_balance, 2) || ', Utilization: ' || ROUND(v_utilization, 1) || '%'
    );
  END IF;

  RETURN NEW;
END;
$function$;

-- Create trigger for auto-resume
DROP TRIGGER IF EXISTS trg_check_auto_resume ON public.transactions;
CREATE TRIGGER trg_check_auto_resume
  AFTER INSERT ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.check_auto_resume();
