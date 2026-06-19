CREATE OR REPLACE FUNCTION public.reset_overdraft_on_payment_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_prev numeric;
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;
  IF NEW.status <> 'approved' THEN RETURN NEW; END IF;
  IF NEW.client_id IS NULL THEN RETURN NEW; END IF;

  SELECT overdraft_limit_usd INTO v_prev
  FROM public.profiles
  WHERE user_id = NEW.client_id;

  IF COALESCE(v_prev, 0) <= 0 THEN RETURN NEW; END IF;

  UPDATE public.profiles
  SET overdraft_limit_usd = 0
  WHERE user_id = NEW.client_id;

  INSERT INTO public.audit_logs (user_id, action_type, description, org_id)
  VALUES (
    COALESCE(auth.uid(), NEW.client_id),
    'overdraft_reset',
    'Overdraft limit reset from $' || v_prev || ' to $0 after deposit ৳' || COALESCE(NEW.amount_bdt, 0) || ' approved (request ' || NEW.id || ')',
    NEW.org_id
  );

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS reset_overdraft_on_payment_approval_trg ON public.payment_requests;
CREATE TRIGGER reset_overdraft_on_payment_approval_trg
AFTER UPDATE OF status ON public.payment_requests
FOR EACH ROW
EXECUTE FUNCTION public.reset_overdraft_on_payment_approval();