ALTER TABLE public.ai_campaign_drafts
  ADD COLUMN IF NOT EXISTS objective text,
  ADD COLUMN IF NOT EXISTS product_name text;