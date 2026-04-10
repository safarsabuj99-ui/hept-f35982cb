
-- Create subscription_payments table
CREATE TABLE public.subscription_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  invoice_id uuid REFERENCES public.platform_invoices(id) ON DELETE SET NULL,
  amount_bdt numeric NOT NULL,
  payment_method text NOT NULL DEFAULT 'manual',
  gateway_provider text,
  gateway_payment_id text,
  transaction_reference text,
  proof_image_url text,
  status text NOT NULL DEFAULT 'pending',
  admin_note text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.subscription_payments ENABLE ROW LEVEL SECURITY;

-- Agency admin can read and insert own org payments
CREATE POLICY "org_admin_read_own_subscription_payments"
  ON public.subscription_payments FOR SELECT TO authenticated
  USING (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "org_admin_insert_own_subscription_payments"
  ON public.subscription_payments FOR INSERT TO authenticated
  WITH CHECK (org_id = get_user_org_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

-- Platform owner full access
CREATE POLICY "platform_owner_all_subscription_payments"
  ON public.subscription_payments FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'platform_owner'::app_role))
  WITH CHECK (has_role(auth.uid(), 'platform_owner'::app_role));

-- Storage bucket for subscription proofs
INSERT INTO storage.buckets (id, name, public) VALUES ('subscription-proofs', 'subscription-proofs', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "authenticated_read_subscription_proofs"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'subscription-proofs');

CREATE POLICY "admin_upload_subscription_proofs"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'subscription-proofs' AND has_role(auth.uid(), 'admin'::app_role));
