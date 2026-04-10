
-- Add pending_payment to org_status enum
ALTER TYPE public.org_status ADD VALUE IF NOT EXISTS 'pending_payment';

-- Allow anonymous users to read active platform plans (for signup page)
CREATE POLICY "anon_read_active_plans"
ON public.platform_plans
FOR SELECT
TO anon
USING (is_active = true);

-- Allow anonymous users to upload to subscription-proofs bucket
CREATE POLICY "anon_upload_subscription_proofs"
ON storage.objects
FOR INSERT
TO anon
WITH CHECK (bucket_id = 'subscription-proofs');

-- Allow public read of subscription-proofs
CREATE POLICY "public_read_subscription_proofs"
ON storage.objects
FOR SELECT
TO anon
USING (bucket_id = 'subscription-proofs');
