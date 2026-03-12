ALTER TABLE public.daily_metrics
  ADD COLUMN reach integer NOT NULL DEFAULT 0,
  ADD COLUMN new_messaging_contacts integer NOT NULL DEFAULT 0;