
ALTER TABLE public.daily_metrics
  ADD COLUMN IF NOT EXISTS frequency numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cost_per_result numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS result_type text,
  ADD COLUMN IF NOT EXISTS video_views numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS video_p25 numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS video_p50 numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS video_p75 numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS video_p100 numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS all_conversions numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS all_conversions_value numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS view_through_conversions numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS engagement_rate numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unique_clicks numeric DEFAULT 0;

ALTER TABLE public.campaign_performance
  ADD COLUMN IF NOT EXISTS frequency numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cost_per_result numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS result_type text,
  ADD COLUMN IF NOT EXISTS video_views numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS video_p25 numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS video_p50 numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS video_p75 numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS video_p100 numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS all_conversions numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS all_conversions_value numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS view_through_conversions numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS engagement_rate numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unique_clicks numeric DEFAULT 0;
