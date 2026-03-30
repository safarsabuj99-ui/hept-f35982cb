
-- Add proof_image_url column to payment_requests
ALTER TABLE public.payment_requests ADD COLUMN proof_image_url text DEFAULT NULL;

-- Create storage bucket for payment proofs
INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-proofs', 'payment-proofs', true);

-- RLS: Clients can upload to their own folder
CREATE POLICY "client_upload_own_proofs"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'payment-proofs'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- RLS: Clients can read their own proofs
CREATE POLICY "client_read_own_proofs"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'payment-proofs'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- RLS: Admins can read all proofs
CREATE POLICY "admin_read_all_proofs"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'payment-proofs'
  AND public.has_role(auth.uid(), 'admin')
);

-- RLS: Allow clients to read agency accounts (for account selector)
CREATE POLICY "client_read_active_agency_accounts"
ON public.agency_accounts FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'client'::app_role) AND is_active = true
);
