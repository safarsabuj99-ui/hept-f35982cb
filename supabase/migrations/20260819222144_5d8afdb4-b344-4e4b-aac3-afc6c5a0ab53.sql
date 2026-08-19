ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS status_confirmed_at timestamptz;
UPDATE public.campaigns SET status_confirmed_at = updated_at WHERE status_confirmed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_campaigns_status_confirmed_at ON public.campaigns (status_confirmed_at);