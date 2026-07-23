
CREATE TABLE public.refunds (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  payment_request_id uuid NOT NULL REFERENCES public.payment_requests(id) ON DELETE CASCADE,
  client_id uuid NOT NULL,
  org_id uuid REFERENCES public.organizations(id),
  refunded_from_account_id uuid NOT NULL REFERENCES public.agency_accounts(id),
  amount_bdt numeric NOT NULL CHECK (amount_bdt > 0),
  exchange_rate numeric NOT NULL CHECK (exchange_rate > 0),
  amount_usd numeric NOT NULL CHECK (amount_usd > 0),
  note text NOT NULL,
  transaction_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL,
  refunded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_refunds_payment_request ON public.refunds(payment_request_id);
CREATE INDEX idx_refunds_client ON public.refunds(client_id);
CREATE INDEX idx_refunds_org ON public.refunds(org_id);

GRANT SELECT, INSERT ON public.refunds TO authenticated;
GRANT ALL ON public.refunds TO service_role;

ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_refunds" ON public.refunds
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) AND org_id = get_user_org_id(auth.uid()))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND org_id = get_user_org_id(auth.uid()));

CREATE POLICY "client_read_own_refunds" ON public.refunds
  FOR SELECT TO authenticated
  USING (client_id = auth.uid());

-- Auto-fill org_id from payment_request
CREATE OR REPLACE FUNCTION public.set_refund_org_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.org_id IS NULL THEN
    SELECT org_id, client_id INTO NEW.org_id, NEW.client_id
    FROM public.payment_requests
    WHERE id = NEW.payment_request_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_refund_org_id
  BEFORE INSERT ON public.refunds
  FOR EACH ROW EXECUTE FUNCTION public.set_refund_org_id();

-- Notify client on refund
CREATE OR REPLACE FUNCTION public.notify_on_refund()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notifications (user_id, title, body, type, link, org_id, priority)
  VALUES (
    NEW.client_id,
    'Refund Issued 💸',
    '৳' || public.fmt_money(NEW.amount_bdt) || ' refunded to you' ||
      CASE WHEN NULLIF(TRIM(NEW.note), '') IS NOT NULL THEN '. Note: ' || TRIM(NEW.note) ELSE '' END,
    'payment',
    '/dashboard/wallet?highlight=' || NEW.payment_request_id::text,
    NEW.org_id,
    'high'
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_on_refund
  AFTER INSERT ON public.refunds
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_refund();
