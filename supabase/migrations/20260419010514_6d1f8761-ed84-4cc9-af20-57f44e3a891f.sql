ALTER TABLE public.sync_account_stats
  ADD COLUMN IF NOT EXISTS last_fast_lane_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_fast_lane_rows integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS consecutive_zero_runs integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_sync_account_stats_zero_runs
  ON public.sync_account_stats (consecutive_zero_runs);