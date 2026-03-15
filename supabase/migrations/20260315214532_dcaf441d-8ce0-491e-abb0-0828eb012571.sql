
-- Fix auto_debit_on_spend: use campaigns.client_id directly instead of ad_account_clients LIMIT 1
CREATE OR REPLACE FUNCTION public.auto_debit_on_spend()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_client_id uuid;
  v_platform ad_platform;
  v_ad_account_id uuid;
BEGIN
  -- Only act if spend > 0
  IF COALESCE(NEW.spend, 0) = 0 THEN
    RETURN NEW;
  END IF;

  -- Get client_id, platform, and ad_account_id directly from campaigns
  -- This is the authoritative source — no ambiguity on shared accounts
  SELECT c.ad_account_id, c.platform, c.client_id
  INTO v_ad_account_id, v_platform, v_client_id
  FROM public.campaigns c
  WHERE c.id = NEW.campaign_id;

  -- If campaign not found or no client assigned, skip
  IF v_client_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Delete existing auto-debit for this campaign+date (idempotent)
  DELETE FROM public.transactions
  WHERE description = 'auto_spend:' || NEW.campaign_id || ':' || NEW.data_date
    AND client_id = v_client_id
    AND type = 'debit';

  -- Insert new debit transaction
  INSERT INTO public.transactions (client_id, type, amount, platform, date, created_by, status, description)
  VALUES (
    v_client_id,
    'debit',
    NEW.spend,
    v_platform,
    NEW.data_date,
    v_client_id,
    'completed',
    'auto_spend:' || NEW.campaign_id || ':' || NEW.data_date
  );

  RETURN NEW;
END;
$function$;
