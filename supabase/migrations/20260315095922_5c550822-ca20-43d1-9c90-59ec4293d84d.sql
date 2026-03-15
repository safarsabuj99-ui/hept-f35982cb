ALTER TABLE public.profiles
  ADD COLUMN guard_paused_at timestamptz DEFAULT NULL,
  ADD COLUMN guard_resume_window_hours integer NOT NULL DEFAULT 24;