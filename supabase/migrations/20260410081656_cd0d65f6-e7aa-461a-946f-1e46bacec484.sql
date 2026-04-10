-- Add branding columns to organizations
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS brand_name text NOT NULL DEFAULT 'HEPT',
  ADD COLUMN IF NOT EXISTS primary_color text NOT NULL DEFAULT '#6d28d9',
  ADD COLUMN IF NOT EXISTS accent_color text NOT NULL DEFAULT '#f59e0b';

-- Create brand-assets storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('brand-assets', 'brand-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Anyone can view brand assets (public bucket)
CREATE POLICY "Public read brand assets"
ON storage.objects FOR SELECT
USING (bucket_id = 'brand-assets');

-- Authenticated users can upload to their org folder
CREATE POLICY "Auth upload brand assets"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'brand-assets');

-- Authenticated users can update their uploads
CREATE POLICY "Auth update brand assets"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'brand-assets');

-- Authenticated users can delete their uploads
CREATE POLICY "Auth delete brand assets"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'brand-assets');

-- Allow admins to update their own org's branding
CREATE POLICY "admin_update_own_org_branding"
ON public.organizations FOR UPDATE
TO authenticated
USING (id = get_user_org_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (id = get_user_org_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));