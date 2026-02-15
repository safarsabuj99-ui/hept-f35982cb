
-- Add custom exchange rate override per client
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS custom_exchange_rate numeric;

-- Add token health fields to api_integrations
ALTER TABLE public.api_integrations ADD COLUMN IF NOT EXISTS token_expiry_date date;
ALTER TABLE public.api_integrations ADD COLUMN IF NOT EXISTS connection_status text NOT NULL DEFAULT 'active';

-- Add daily spending limit to ad_accounts
ALTER TABLE public.ad_accounts ADD COLUMN IF NOT EXISTS daily_spending_limit numeric DEFAULT 250;
