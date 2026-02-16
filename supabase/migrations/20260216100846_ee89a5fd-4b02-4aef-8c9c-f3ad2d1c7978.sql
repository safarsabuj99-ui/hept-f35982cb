
ALTER TABLE public.ad_accounts ADD COLUMN account_name text NOT NULL DEFAULT '';
ALTER TABLE public.ad_accounts ALTER COLUMN client_id DROP NOT NULL;
