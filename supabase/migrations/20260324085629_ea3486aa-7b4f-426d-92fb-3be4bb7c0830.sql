ALTER TABLE public.daily_metrics
  ADD COLUMN IF NOT EXISTS budget numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS conversations_tiktok_dm integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS leads_tiktok_dm integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS conversations_instant_msg integer NOT NULL DEFAULT 0;