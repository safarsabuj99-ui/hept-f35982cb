
-- Trigger function: auto-create debit transaction when daily_metrics spend is recorded
CREATE OR REPLACE FUNCTION public.auto_debit_on_spend()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_client_id uuid;
  v_platform ad_platform;
  v_ad_account_id uuid;
BEGIN
  -- Only act if spend > 0
  IF COALESCE(NEW.spend, 0) = 0 THEN
    RETURN NEW;
  END IF;

  -- Look up campaign -> ad_account -> client
  SELECT c.ad_account_id, c.platform
  INTO v_ad_account_id, v_platform
  FROM public.campaigns c
  WHERE c.id = NEW.campaign_id;

  IF v_ad_account_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get client from ad_account_clients junction (pick first)
  SELECT aac.client_id
  INTO v_client_id
  FROM public.ad_account_clients aac
  WHERE aac.ad_account_id = v_ad_account_id
  LIMIT 1;

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
$$;

-- Create trigger on daily_metrics
CREATE TRIGGER trg_auto_debit_on_spend
AFTER INSERT OR UPDATE ON public.daily_metrics
FOR EACH ROW
EXECUTE FUNCTION public.auto_debit_on_spend();

-- Backfill: Create debit transactions for all existing daily_metrics with spend > 0
INSERT INTO public.transactions (client_id, type, amount, platform, date, created_by, status, description)
SELECT DISTINCT ON (dm.campaign_id, dm.data_date)
  aac.client_id,
  'debit'::transaction_type,
  dm.spend,
  c.platform,
  dm.data_date,
  aac.client_id,
  'completed'::transaction_status,
  'auto_spend:' || dm.campaign_id || ':' || dm.data_date
FROM public.daily_metrics dm
JOIN public.campaigns c ON c.id = dm.campaign_id
JOIN public.ad_account_clients aac ON aac.ad_account_id = c.ad_account_id
WHERE dm.spend > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.transactions t
    WHERE t.description = 'auto_spend:' || dm.campaign_id || ':' || dm.data_date
      AND t.client_id = aac.client_id
      AND t.type = 'debit'
  );
