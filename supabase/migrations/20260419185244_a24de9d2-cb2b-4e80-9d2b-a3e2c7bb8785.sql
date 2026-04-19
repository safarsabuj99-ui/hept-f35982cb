
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS snoozed_until timestamptz,
  ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_notifications_user_pinned ON public.notifications(user_id, is_pinned) WHERE is_pinned = true;
CREATE INDEX IF NOT EXISTS idx_notifications_user_snoozed ON public.notifications(user_id, snoozed_until) WHERE snoozed_until IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_user_archived ON public.notifications(user_id, archived_at) WHERE archived_at IS NOT NULL;

ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS min_priority text NOT NULL DEFAULT 'low',
  ADD COLUMN IF NOT EXISTS sound_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_enabled boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.notification_user_settings (
  user_id uuid PRIMARY KEY,
  quiet_start time,
  quiet_end time,
  quiet_timezone text NOT NULL DEFAULT 'Asia/Dhaka',
  dnd_until timestamptz,
  digest_enabled boolean NOT NULL DEFAULT false,
  digest_hour integer NOT NULL DEFAULT 9,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_manage_own_notif_settings"
  ON public.notification_user_settings FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.notification_mutes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  group_key text NOT NULL,
  muted_until timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, group_key)
);

ALTER TABLE public.notification_mutes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_manage_own_notif_mutes"
  ON public.notification_mutes FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_notif_mutes_user ON public.notification_mutes(user_id, muted_until);

CREATE OR REPLACE FUNCTION public.update_notif_settings_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_notif_settings_updated ON public.notification_user_settings;
CREATE TRIGGER trg_notif_settings_updated
  BEFORE UPDATE ON public.notification_user_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_notif_settings_updated_at();
