-- Add objective column to campaigns table
ALTER TABLE public.campaigns ADD COLUMN objective text NOT NULL DEFAULT '';

-- Add funnel action columns to daily_metrics table
ALTER TABLE public.daily_metrics
  ADD COLUMN view_content integer NOT NULL DEFAULT 0,
  ADD COLUMN add_to_cart integer NOT NULL DEFAULT 0,
  ADD COLUMN initiate_checkout integer NOT NULL DEFAULT 0,
  ADD COLUMN purchase integer NOT NULL DEFAULT 0,
  ADD COLUMN messaging_conversations integer NOT NULL DEFAULT 0,
  ADD COLUMN cost_per_purchase numeric NOT NULL DEFAULT 0,
  ADD COLUMN cost_per_message numeric NOT NULL DEFAULT 0,
  ADD COLUMN cpm numeric NOT NULL DEFAULT 0;