
-- Auto-set org_id on payment_requests
CREATE OR REPLACE FUNCTION public.set_org_id_from_auth()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF NEW.org_id IS NULL THEN
    NEW.org_id := get_user_org_id(auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_payment_request_org_id
  BEFORE INSERT ON public.payment_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_org_id_from_auth();

CREATE TRIGGER trg_set_transaction_org_id
  BEFORE INSERT ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.set_org_id_from_auth();
