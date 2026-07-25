CREATE OR REPLACE FUNCTION public.set_refund_org_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.org_id IS NULL AND NEW.payment_request_id IS NOT NULL THEN
    SELECT org_id INTO NEW.org_id
    FROM public.payment_requests
    WHERE id = NEW.payment_request_id;
  END IF;

  IF NEW.org_id IS NULL THEN
    NEW.org_id := public.get_user_org_id(auth.uid());
  END IF;

  IF NEW.org_id IS NULL AND NEW.client_id IS NOT NULL THEN
    SELECT org_id INTO NEW.org_id
    FROM public.profiles
    WHERE user_id = NEW.client_id
    LIMIT 1;
  END IF;

  RETURN NEW;
END;
$function$;