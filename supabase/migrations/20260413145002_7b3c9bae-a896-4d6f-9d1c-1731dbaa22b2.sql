
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
  v_org_id uuid;
BEGIN
  IF COALESCE(NEW.spend, 0) = 0 THEN
    RETURN NEW;
  END IF;

  SELECT c.ad_account_id, c.platform, c.client_id, c.org_id
  INTO v_ad_account_id, v_platform, v_client_id, v_org_id
  FROM public.campaigns c
  WHERE c.id = NEW.campaign_id;

  IF v_client_id IS NULL THEN
    RETURN NEW;
  END IF;

  DELETE FROM public.transactions
  WHERE description = 'auto_spend:' || NEW.campaign_id || ':' || NEW.data_date
    AND client_id = v_client_id
    AND type = 'debit';

  INSERT INTO public.transactions (client_id, type, amount, platform, date, created_by, status, description, org_id)
  VALUES (
    v_client_id,
    'debit',
    NEW.spend,
    v_platform,
    NEW.data_date,
    v_client_id,
    'completed',
    'auto_spend:' || NEW.campaign_id || ':' || NEW.data_date,
    v_org_id
  );

  RETURN NEW;
END;
$function$;
