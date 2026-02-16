
ALTER TABLE public.campaign_performance
  ADD COLUMN IF NOT EXISTS results integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS conversion_value numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
