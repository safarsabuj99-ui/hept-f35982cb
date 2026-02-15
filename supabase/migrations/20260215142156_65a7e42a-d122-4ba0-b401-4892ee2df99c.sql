
-- Add mapping keyword to profiles for auto-assignment
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS mapping_keyword text;

-- Add instance name to api_integrations for multi-instance support
ALTER TABLE public.api_integrations ADD COLUMN IF NOT EXISTS instance_name text DEFAULT '';

-- Add link from ad_accounts to specific api_integration
ALTER TABLE public.ad_accounts ADD COLUMN IF NOT EXISTS api_integration_id uuid REFERENCES public.api_integrations(id);
