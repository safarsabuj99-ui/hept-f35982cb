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
  v_is_payment_approval boolean;
  v_count integer;
BEGIN
  IF NEW.type <> 'credit' OR NEW.status <> 'completed' THEN
    RETURN NEW;
  END IF;

  v_client_id := NEW.client_id;

  SELECT system_paused_campaigns
  INTO v_paused_campaigns
  FROM public.profiles
  WHERE user_id = v_client_id;

  IF v_paused_campaigns IS NULL OR jsonb_array_length(v_paused_campaigns) = 0 THEN
    RETURN NEW;
  END IF;

  -- Detect payment-approval-originated credit (approve-payment writes "Payment: ৳…")
  v_is_payment_approval := COALESCE(NEW.description, '') LIKE 'Payment:%';

  -- Threshold path (legacy): only resume if balance recovered
  IF NOT v_is_payment_approval THEN
    SELECT COALESCE(SUM(CASE WHEN type = 'credit' AND status = 'completed' THEN amount ELSE 0 END), 0)
         - COALESCE(SUM(CASE WHEN type = 'debit'  AND status = 'completed' THEN amount ELSE 0 END), 0)
    INTO v_balance
    FROM public.transactions
    WHERE client_id = v_client_id;

    SELECT auto_pause_balance_usd, overdraft_limit_usd
    INTO v_pause_threshold, v_overdraft
    FROM public.profiles
    WHERE user_id = v_client_id;

    v_effective_threshold := COALESCE(v_pause_threshold, 5) - COALESCE(v_overdraft, 0);

    IF v_balance <= v_effective_threshold THEN
      RETURN NEW;
    END IF;
  END IF;

  SELECT array_agg(elem::text)
  INTO v_campaign_ids
  FROM jsonb_array_elements_text(v_paused_campaigns) AS elem;

  v_count := COALESCE(array_length(v_campaign_ids, 1), 0);

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
    CASE WHEN v_is_payment_approval
      THEN 'Auto-resumed ' || v_count || ' campaign(s) after payment approval (reason: payment_approved)'
      ELSE 'Auto-resumed ' || v_count || ' campaign(s) after deposit. New balance: $' || ROUND(v_balance, 2) || ' (threshold: $' || v_effective_threshold || ')'
    END
  );

  RETURN NEW;
END;
$function$;